export type AutomationRunStatus =
  | 'pending'
  | 'dispatching'
  | 'dispatched'
  | 'completed'
  | 'skipped_precheck'
  | 'skipped_missed'
  | 'skipped_unavailable'
  | 'skipped_needs_interactive_auth'
  | 'skipped_cooldown'
  | 'skipped_run_active'
  | 'dispatch_failed'

/**
 * Statuses a run can never leave; only these are safe to evict from history.
 *
 * Exhaustive on purpose, not a whitelist: a new member left unclassified would be
 * non-final, so the overlap guard would read its skip row as a run still in
 * progress and block the automation forever — and retention never evicts a
 * non-final run, so the row would never age out. The missing case is a build
 * error here rather than a silently wedged schedule.
 */
export function isFinalAutomationRunStatus(status: AutomationRunStatus): boolean {
  switch (status) {
    case 'pending':
    case 'dispatching':
    case 'dispatched':
      return false
    case 'completed':
    case 'dispatch_failed':
    case 'skipped_precheck':
    case 'skipped_missed':
    case 'skipped_unavailable':
    case 'skipped_needs_interactive_auth':
    case 'skipped_cooldown':
    case 'skipped_run_active':
      return true
  }
}
