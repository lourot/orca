import type { WorkspaceStatusDefinition, Worktree } from '../../../../shared/worktree/types'
import {
  getSharedWorkspaceColorTag,
  isMixedWorkspaceColorTagSelection
} from '../../../../shared/workspace-color-tag'
import { getWorkspaceStatus } from './workspace-status'

/** The status every workspace in the context selection carries, or '' when they disagree. */
export function getSharedContextWorkspaceStatus(
  worktrees: readonly Worktree[],
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
): string {
  const [first, ...rest] = worktrees
  if (!first) {
    return ''
  }
  const status = getWorkspaceStatus(first, workspaceStatuses)
  return rest.every((item) => getWorkspaceStatus(item, workspaceStatuses) === status) ? status : ''
}

/** The swatch row's state: the tag the selection shares, and whether its members disagree. */
export function getSharedContextColorTag(worktrees: readonly Worktree[]): {
  colorTag: string | null
  mixed: boolean
} {
  const colorTags = worktrees.map((worktree) => worktree.colorTag)
  return {
    colorTag: getSharedWorkspaceColorTag(colorTags),
    mixed: isMixedWorkspaceColorTagSelection(colorTags)
  }
}
