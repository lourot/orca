import { describe, expect, it } from 'vitest'
import { isFinalAutomationRunStatus, type AutomationRunStatus } from './automation-run-status'

const ALL_STATUSES = [
  'pending',
  'dispatching',
  'dispatched',
  'completed',
  'skipped_precheck',
  'skipped_missed',
  'skipped_unavailable',
  'skipped_needs_interactive_auth',
  'skipped_cooldown',
  'skipped_run_active',
  'dispatch_failed'
] as const satisfies readonly AutomationRunStatus[]

/** Completeness guard: a union member missing from the table above fails to compile here,
 *  so the table cannot silently stop standing for the whole surface. Exported only because
 *  an unused local type alias is itself an error. */
type AssertNever<T extends never> = T
export type EveryStatusCovered = AssertNever<
  Exclude<AutomationRunStatus, (typeof ALL_STATUSES)[number]>
>

const NON_FINAL = new Set<AutomationRunStatus>(['pending', 'dispatching', 'dispatched'])

describe('isFinalAutomationRunStatus', () => {
  // Why the whole map rather than a case each: an unclassified status defaults to non-final,
  // so the overlap guard reads its skip row as a run still in progress and blocks the
  // automation forever -- and retention never evicts a non-final run, so the row never ages
  // out. One toEqual names every offender instead of stopping at the first.
  it('classifies every status, with only the in-flight ones non-final', () => {
    const classified = Object.fromEntries(
      ALL_STATUSES.map((status) => [status, isFinalAutomationRunStatus(status)])
    )
    expect(classified).toEqual(
      Object.fromEntries(ALL_STATUSES.map((status) => [status, !NON_FINAL.has(status)]))
    )
  })
})
