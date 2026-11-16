import type { Store } from '../persistence'
import { isFinalAutomationRunStatus } from '../../shared/automation-run-status'
import { MAX_AUTOMATION_PRECHECK_TIMEOUT_SECONDS } from '../../shared/automation-precheck'
import type { Automation, AutomationRun, AutomationRunStatus } from '../../shared/automations-types'
import {
  automationRunFailure,
  type AutomationRunFailure
} from '../../shared/automation-run-failure-copy'
import type { AutomationRunTargetResult } from './run-target-resolution'
import type { AutomationRunWriter } from './automation-run-writer'
import { describeScheduledTickRefusal } from './dispatch-refusal'

export type ScheduledRefusal = { status: AutomationRunStatus } & AutomationRunFailure

/**
 * Nothing legitimately sits at `pending`: the row exists but was never handed to an
 * executor, so anything older than the dispatch handoff is debris.
 */
const PENDING_STALE_MS = 2 * 60 * 1000

/**
 * `dispatching` is a bounded handoff: the precheck's own cap plus a worktree create. Past it the
 * executor dropped the run (a renderer reload mid-handoff), and only a restart would close the row.
 */
const DISPATCHING_STALE_MS = MAX_AUTOMATION_PRECHECK_TIMEOUT_SECONDS * 1000 + 5 * 60 * 1000

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
    const bound =
      run.status === 'pending'
        ? PENDING_STALE_MS
        : run.status === 'dispatching'
          ? DISPATCHING_STALE_MS
          : DISPATCHED_STALE_MS
    return age < bound
  })
}

/** True while the run's pane still holds the run's own PTY. */
export type RunSessionOpenProbe = (run: AutomationRun) => boolean

/**
 * The production `RunSessionOpenProbe`. Reads the pane's PTY directly: a handle-based
 * lookup sees only headless panes, so desktop tabs would always read as closed.
 */
export function isRunSessionLive(
  runtime: { getLiveTerminalPtyIdForPaneKey(paneKey: string): string | null },
  run: Pick<AutomationRun, 'terminalPaneKey' | 'terminalPtyId'>
): boolean {
  const { terminalPaneKey, terminalPtyId } = run
  return Boolean(
    terminalPaneKey &&
    terminalPtyId &&
    runtime.getLiveTerminalPtyIdForPaneKey(terminalPaneKey) === terminalPtyId
  )
}

/**
 * Whether a session this automation started is still open, for `skipWhileSessionOpen`.
 *
 * Open means the run's pane still holds the run's own PTY, so a closed pane or one taken
 * over by another session never blocks the schedule. Without a probe nothing is provably
 * open, and the run goes ahead as a fresh session.
 */
export function hasOpenAutomationSession(
  automation: Automation,
  runs: readonly AutomationRun[],
  isRunSessionOpen: RunSessionOpenProbe | undefined
): boolean {
  if (!automation.skipWhileSessionOpen || automation.reuseSession || !isRunSessionOpen) {
    return false
  }
  return runs.some(
    (run) =>
      run.automationId === automation.id &&
      Boolean(run.terminalPaneKey) &&
      Boolean(run.terminalPtyId) &&
      isRunSessionOpen(run)
  )
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
 * The host refusal plus the run guards, for a scheduled occurrence only: read before the
 * row exists, or the row itself would read as the active run.
 *
 * Order matters: host refusals first, so a genuinely broken automation is still
 * reported on its first suppressed occurrence rather than hidden behind a long
 * cooldown. Overlap before cooldown because it is the more actionable truth, and
 * because a fixed precedence keeps the fold from thrashing between two statuses.
 */
export async function describeOccurrenceRefusal(
  store: Store,
  input: {
    automation: Automation
    target: AutomationRunTargetResult
    canDispatch: boolean
    runs: readonly AutomationRun[]
    now: number
    isRunSessionOpen?: RunSessionOpenProbe
  }
): Promise<ScheduledRefusal | null> {
  const hostRefusal = await describeScheduledTickRefusal(store, input)
  if (hostRefusal) {
    return { status: 'skipped_unavailable', ...hostRefusal }
  }
  if (hasActiveAutomationRun(input.automation, input.runs, input.now)) {
    return { status: 'skipped_run_active', ...automationRunFailure('skippedRunActive') }
  }
  if (hasOpenAutomationSession(input.automation, input.runs, input.isRunSessionOpen)) {
    return { status: 'skipped_run_active', ...automationRunFailure('skippedSessionOpen') }
  }
  if (isWithinRunCooldown(input.automation, input.now)) {
    return { status: 'skipped_cooldown', ...automationRunFailure('skippedCooldown') }
  }
  return null
}

/** Folds the refusal into the newest matching skip row, or writes a fresh one.
 *  Returns whether it folded, which is what lets callers log only the first time. */
export async function recordScheduledSkip(input: {
  runs: AutomationRunWriter
  automation: Automation
  scheduledFor: number
  refusal: ScheduledRefusal
}): Promise<boolean> {
  const { runs, automation, scheduledFor, refusal } = input
  if (await runs.repeatSkip(automation.id, refusal.error, scheduledFor, refusal.status)) {
    return true
  }
  const run = await runs.createRun(automation, scheduledFor)
  if (run.status !== 'pending') {
    return false
  }
  await runs.updateRun({
    runId: run.id,
    workspaceId: automation.workspaceId,
    ...refusal
  })
  return false
}

/**
 * Records and returns the refusal row when an active run or an open session blocks a
 * manual start, else null.
 *
 * Read before the row exists, or the row itself would read as the active run. The
 * cooldown is deliberately not consulted here: overlap is a hazard whoever asked —
 * two agents in one worktree — while a cooldown is a preference, and "Run now" has to
 * stay a way out of a misconfigured guard. An open session is the user's explicit
 * "one session at a time", so it binds Run now too.
 */
export async function recordManualRunRefusal(
  runs: AutomationRunWriter,
  store: Pick<Store, 'listAutomationRuns'>,
  automation: Automation,
  now: number,
  isRunSessionOpen?: RunSessionOpenProbe
): Promise<AutomationRun | null> {
  const existingRuns = store.listAutomationRuns(automation.id)
  const failure = hasActiveAutomationRun(automation, existingRuns, now)
    ? automationRunFailure('skippedRunActive')
    : hasOpenAutomationSession(automation, existingRuns, isRunSessionOpen)
      ? automationRunFailure('skippedSessionOpen')
      : null
  if (!failure) {
    return null
  }
  const run = await runs.createRun(automation, now, 'manual')
  // A deduped row is a sibling's live run; overwriting it would cancel that run.
  if (run.status !== 'pending') {
    return run
  }
  return await runs.updateRun({
    runId: run.id,
    status: 'skipped_run_active',
    workspaceId: automation.workspaceId,
    ...failure
  })
}

/**
 * Records why a scheduled occurrence must not start, folded into the newest matching skip row.
 * Returns whether it was refused; a project the WSL host now runs is refused without a row,
 * since a skip per tick would only churn the retained local copy.
 */
export async function recordScheduledOccurrenceRefusal(input: {
  store: Store
  runs: AutomationRunWriter
  automation: Automation
  target: AutomationRunTargetResult
  canDispatch: boolean
  scheduledFor: number
  now: number
  isRunSessionOpen?: RunSessionOpenProbe
}): Promise<boolean> {
  const { store, runs, automation, scheduledFor } = input
  const refusal = await describeOccurrenceRefusal(store, {
    ...input,
    runs: store.listAutomationRuns(automation.id)
  })
  if (refusal && refusal.errorCode !== 'wslMoveOwnedByHost') {
    await recordScheduledSkip({ runs, automation, scheduledFor, refusal })
  }
  return refusal !== null
}
