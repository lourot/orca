import type { Automation } from '../../../shared/automations-types'

/**
 * Whether a run's session stays open when the run finishes. Reuse needs it as the next run's
 * seed and skip-if-open needs it to detect anything, so only a Fresh run can opt into closing.
 */
export function keepsAutomationSessionOpen(
  automation: Pick<Automation, 'reuseSession' | 'skipWhileSessionOpen' | 'keepSessionOpen'>
): boolean {
  return (
    automation.reuseSession ||
    automation.skipWhileSessionOpen === true ||
    automation.keepSessionOpen === true
  )
}
