import type {
  Automation,
  AutomationUpdateInput,
  AutomationWorkspaceMode
} from '../../../shared/automations-types'

/** Reuse and skip-if-open are one exclusive choice: requesting either clears the other. */
export function resolveAutomationSessionMode(
  workspaceMode: AutomationWorkspaceMode,
  requested: Pick<AutomationUpdateInput, 'reuseSession' | 'skipWhileSessionOpen'>,
  current: Pick<Automation, 'reuseSession' | 'skipWhileSessionOpen'>
): { reuseSession: boolean; skipWhileSessionOpen: boolean } {
  if (requested.reuseSession === true && requested.skipWhileSessionOpen === true) {
    throw new Error('Choose either session reuse or skip-if-open, not both.')
  }
  const reuseSession =
    requested.skipWhileSessionOpen === true
      ? false
      : (requested.reuseSession ?? current.reuseSession ?? false)
  const skipWhileSessionOpen =
    requested.reuseSession === true
      ? false
      : (requested.skipWhileSessionOpen ?? current.skipWhileSessionOpen ?? false)
  return { reuseSession: workspaceMode === 'existing' && reuseSession, skipWhileSessionOpen }
}
