/**
 * What the owning authority says, and writes, when it refuses to start a run.
 *
 * Kept together because every refusal must be one fixed sentence: skip
 * coalescing folds repeats only on byte-identical text, so a reason that varied
 * per occurrence would write a row each.
 */
import type { WebContents } from 'electron'
import type { Store } from '../persistence'
import { isFinalAutomationRunStatus } from '../../shared/automation-run-status'
import type {
  Automation,
  AutomationDispatchRequest,
  AutomationRun,
  AutomationRunStatus
} from '../../shared/automations-types'
import { resolveAutomationRunTarget, type AutomationRunTargetResult } from './run-target-resolution'
import type { AutomationRunWriter } from './automation-run-writer'

export const NO_DISPATCH_HOST = 'No Orca window was available to launch the automation.'

/** The automation dispatched an agent too recently for this occurrence to be wanted. */
export const SKIPPED_FOR_COOLDOWN =
  'This automation ran recently, so the scheduled run was skipped.'

/** A previous run of the same automation has not finished. */
export const SKIPPED_RUN_ACTIVE =
  'A previous run was still active, so the scheduled run was skipped.'

/** A record the tick could not evaluate at all — its schedule no longer resolves (#16303). */
export const UNEVALUABLE_SCHEDULE =
  'Orca could not evaluate this automation and skipped the occurrence.'

/** A record the authority refuses to execute at all, with no target diagnosis of its own. */
export const NO_RUNNABLE_HOST = 'This automation has no host to run on.'

export type ScheduledRefusal = { status: AutomationRunStatus; error: string }

/**
 * Nothing legitimately sits at `pending`: the row exists but was never handed to an
 * executor, so anything older than the dispatch handoff is debris.
 */
const PENDING_STALE_MS = 2 * 60 * 1000

/**
 * Longer than any agent session Orca has reason to believe in. A run that never
 * reports back (stalled dispatch, an agent that never launched) must stop blocking
 * the schedule eventually, or the overlap guard — which defaults on — turns one stuck
 * run into a permanently dead automation.
 *
 * Erring long is deliberate: too short launches a second agent into the same worktree
 * of a run that is still alive (worse under `reuseSession`, where both type into one
 * terminal), while too long only delays recovery from a run that will never finish.
 * It also means existing stores full of crashed-session rows are already over the
 * bound, so turning the guard on cannot brick anyone on day one.
 */
const DISPATCHED_STALE_MS = 24 * 60 * 60 * 1000

/**
 * Whether a previous run is still plausibly executing.
 *
 * A pure read: it never finalizes the stale run it steps over. Closing out a run from
 * a predicate would rewrite history the completion watcher owns, and asking the
 * terminal observer whether the run's terminal still resolves is barred outright —
 * loss of contact is never evidence of process death (see the SSH execution boundary).
 * An age bound makes no claim about the process at all.
 */
export function hasActiveAutomationRun(
  automation: Automation,
  runs: readonly AutomationRun[],
  now: number
): boolean {
  if (automation.skipWhileRunActive === false) {
    return false
  }
  return runs.some((run) => {
    if (run.automationId !== automation.id || isFinalAutomationRunStatus(run.status)) {
      return false
    }
    const age = Math.max(0, now - (run.dispatchedAt ?? run.startedAt ?? run.createdAt))
    return age < (run.status === 'pending' ? PENDING_STALE_MS : DISPATCHED_STALE_MS)
  })
}

/** Reads `lastDispatchedAt`, never `lastRunAt`: the latter is stamped by skips too, so a
 *  cooldown on it would extend itself every time it fired and never run again. */
export function isWithinRunCooldown(automation: Automation, now: number): boolean {
  const minutes = automation.minMinutesSinceLastRun ?? 0
  const lastDispatchedAt = automation.lastDispatchedAt
  if (minutes <= 0 || typeof lastDispatchedAt !== 'number') {
    return false
  }
  return now - lastDispatchedAt < minutes * 60 * 1000
}

/**
 * Every reason this occurrence cannot start, decided before a run row exists so
 * the scheduler can fold repeats instead of writing one row each.
 *
 * Order matters: host refusals first, so a genuinely broken automation is still
 * reported on its first suppressed occurrence rather than hidden behind a long
 * cooldown. Overlap before cooldown because it is the more actionable truth, and
 * because a fixed precedence keeps the fold from thrashing between two statuses.
 */
export function describeScheduledRefusal(input: {
  automation: Automation
  target: AutomationRunTargetResult
  canDispatch: boolean
  runs: readonly AutomationRun[]
  now: number
}): ScheduledRefusal | null {
  if (!input.target.ok) {
    return { status: 'skipped_unavailable', error: input.target.error }
  }
  if (!input.canDispatch) {
    return { status: 'skipped_unavailable', error: NO_DISPATCH_HOST }
  }
  if (hasActiveAutomationRun(input.automation, input.runs, input.now)) {
    return { status: 'skipped_run_active', error: SKIPPED_RUN_ACTIVE }
  }
  if (isWithinRunCooldown(input.automation, input.now)) {
    return { status: 'skipped_cooldown', error: SKIPPED_FOR_COOLDOWN }
  }
  return null
}

/** Folds the refusal into the newest matching skip row, or writes a fresh one.
 *  Returns whether it folded, which is what lets callers log only the first time. */
export function recordScheduledSkip(input: {
  runs: AutomationRunWriter
  automation: Automation
  scheduledFor: number
  refusal: ScheduledRefusal
}): boolean {
  const { runs, automation, scheduledFor, refusal } = input
  if (runs.repeatSkip(automation.id, refusal.error, scheduledFor, refusal.status)) {
    return true
  }
  const run = runs.createRun(automation, scheduledFor)
  runs.updateRun({
    runId: run.id,
    status: refusal.status,
    workspaceId: automation.workspaceId,
    error: refusal.error
  })
  return false
}

/**
 * Records and returns the refusal row when an active run blocks a manual start, else null.
 *
 * Read before the row exists, or the row itself would read as the active run. The
 * cooldown is deliberately not consulted here: overlap is a hazard whoever asked —
 * two agents in one worktree — while a cooldown is a preference, and "Run now" has to
 * stay a way out of a misconfigured guard.
 */
export function recordManualRunBlockedByActiveRun(input: {
  runs: AutomationRunWriter
  automation: Automation
  activeRuns: readonly AutomationRun[]
  now: number
}): AutomationRun | null {
  if (!hasActiveAutomationRun(input.automation, input.activeRuns, input.now)) {
    return null
  }
  const run = input.runs.createRun(input.automation, input.now, 'manual')
  return input.runs.updateRun({
    runId: run.id,
    status: 'skipped_run_active',
    workspaceId: input.automation.workspaceId,
    error: SKIPPED_RUN_ACTIVE
  })
}

/**
 * Records the manual attempt an execute fence refused before dispatch existed.
 *
 * The typed conflict answers the caller; run history is what answers the user,
 * and doc:94 asks for both. Never dispatches: the reason is the one the
 * scheduler would have written for the same record.
 */
export function recordRefusedAutomationRun(input: {
  store: Store
  runs: AutomationRunWriter
  automation: Automation
  allowRemoteHostScheduling: boolean
}): void {
  const target = resolveAutomationRunTarget(input.store, input.automation, {
    allowRemoteHostScheduling: input.allowRemoteHostScheduling
  })
  const run = input.runs.createRun(input.automation, Date.now(), 'manual')
  input.runs.updateRun({
    runId: run.id,
    status: 'skipped_unavailable',
    workspaceId: input.automation.workspaceId,
    error: target.ok ? NO_RUNNABLE_HOST : target.error
  })
}

/**
 * Marks the poison record the scheduler tick just stepped over, so the user sees why it
 * stalled. Folds on the fixed sentence and the unchanged nextRunAt, so a record that stays
 * broken writes one row rather than one per tick, and never throws back into the tick.
 */
export function recordUnevaluableAutomation(input: {
  runs: AutomationRunWriter
  automation: Automation
  error: unknown
}): void {
  const { automation } = input
  try {
    // nextRunAt deliberately stays put: the record is retried so a repaired schedule resumes
    // on its own. The fold is what keeps that from writing a row — and logging — every tick.
    const folded = recordScheduledSkip({
      runs: input.runs,
      automation,
      scheduledFor: automation.nextRunAt,
      refusal: { status: 'skipped_unavailable', error: UNEVALUABLE_SCHEDULE }
    })
    if (!folded) {
      console.error('[automations] failed to evaluate automation:', automation.id, input.error)
    }
  } catch (writeError) {
    // The original failure has not been reported yet on this path, so carry it too.
    console.error(
      '[automations] failed to record unevaluable automation:',
      automation.id,
      input.error,
      writeError
    )
  }
}

/**
 * Sends the dispatch request through the renderer channel, closing the run out as
 * `dispatch_failed` when the send throws — a failed send is not an unreadable schedule.
 */
export function sendRendererDispatch(
  channel: Pick<WebContents, 'send'> | null,
  payload: AutomationDispatchRequest,
  runs: AutomationRunWriter,
  run: AutomationRun
): AutomationRun {
  try {
    channel?.send('automations:dispatchRequested', payload)
    return run
  } catch (error) {
    return runs.updateRun({
      runId: run.id,
      status: 'dispatch_failed',
      workspaceId: run.workspaceId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * Grace is a downtime catch-up budget. It must not also absorb the scheduler's own tick latency:
 * evaluation runs on a fixed interval never aligned to an occurrence, so with zero grace every
 * tick arrived "late" and skipped the run, blaming downtime that never happened (#11299).
 *
 * Why not process liveness: a suspended process (system sleep) keeps its start time, so a
 * liveness flag waves through an occurrence that came due during a multi-hour sleep -- exactly
 * what grace exists for. Elapsed lateness cannot be faked that way.
 *
 * Consequence worth knowing: elapsed lateness cannot distinguish a short outage from a late
 * tick, so a zero-grace run that came due during an outage shorter than the tolerance is
 * dispatched rather than skipped. That is the deliberate trade -- the alternative was a
 * liveness flag, which got the far worse case wrong (a multi-hour sleep replayed on wake).
 *
 * Known remaining gap: an evaluation pass holds the re-entrancy guard across its dispatches, and
 * in serve mode a dispatch runs inline (precheck up to 600s, then a worktree create). A pass
 * longer than the tolerance drops every intervening tick, so the next automation's lateness is
 * the scheduler's stall rather than downtime and can still be mis-skipped. Desktop is
 * unaffected -- its dispatch is synchronous IPC. Tracked separately; forgiving "time since the
 * last pass" is NOT the fix, because a suspended process runs no passes either.
 */
export function missedBeyondGrace(input: {
  automation: Automation
  scheduledFor: number
  now: number
  tickMs: number
}): boolean {
  const graceMs = input.automation.missedRunGraceMinutes * 60 * 1000
  // Two intervals: one for the tick that should have caught it, one for ordinary jitter.
  const jitterMs = input.tickMs * 2
  return input.now - input.scheduledFor > graceMs + jitterMs
}

export function recordMissedRun(input: {
  runs: AutomationRunWriter
  automation: Automation
  scheduledFor: number
}): void {
  const missed = input.runs.createRun(input.automation, input.scheduledFor)
  input.runs.updateRun({
    runId: missed.id,
    status: 'skipped_missed',
    workspaceId: input.automation.workspaceId,
    error: 'This run was past its missed-run grace window when Orca next checked.'
  })
}
