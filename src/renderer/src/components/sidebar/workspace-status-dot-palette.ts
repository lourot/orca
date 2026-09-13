import { DEFAULT_STATUS_VISUALS } from '../../../../shared/workspace-status-defaults'
import type { WorkspaceStatusDefinition } from '../../../../shared/worktree/types'

/**
 * Sidebar-dot colour ramp, which answers "does this need me?" rather than
 * "what state is this in" — the question the board's own lane colours answer.
 * Deliberately scoped to the dot: the board lanes keep the catalog colours.
 */
const DOT_COLOR_BY_STATUS: Record<string, string> = {
  todo: 'rose',
  'in-progress': 'conductor-progress',
  'in-review': 'rose',
  completed: 'emerald'
}

// Why: a workspace that claims to be in progress with nothing running is not
// actually in progress, so it drops out of the ramp instead of staying amber.
const IDLE_IN_PROGRESS_COLOR = 'neutral'

/**
 * Resolves what the dot should paint, letting a colour the user picked
 * themselves override the ramp.
 */
export function resolveWorkspaceStatusDotVisualSource(
  statusId: string,
  definition: WorkspaceStatusDefinition | undefined,
  hasOpenTab: boolean
): WorkspaceStatusDefinition | string {
  const storedColor = definition?.color
  const usesShippedColor =
    storedColor === undefined || storedColor === DEFAULT_STATUS_VISUALS[statusId]?.color
  if (!usesShippedColor) {
    return definition ?? statusId
  }
  const rampColor =
    statusId === 'in-progress' && !hasOpenTab
      ? IDLE_IN_PROGRESS_COLOR
      : DOT_COLOR_BY_STATUS[statusId]
  if (rampColor === undefined) {
    return definition ?? statusId
  }
  return { id: statusId, label: definition?.label ?? statusId, color: rampColor }
}
