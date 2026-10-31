import type {
  WorkspaceStatus,
  WorkspaceStatusDefinition,
  Worktree
} from '../../../../shared/worktree/types'
import type { SortBy } from '../../../../shared/sidebar-list/smart-sort'
import { getWorkspaceStatus } from './workspace-status'
import { compareWorktreeDisplayName } from '@/lib/worktree-display-name-order'
import { getWorktreeHostIdentity } from '../../../../shared/worktree/host-qualified-identity'

function sortBoardWorktrees(a: Worktree, b: Worktree): number {
  return b.lastActivityAt - a.lastActivityAt || compareWorktreeDisplayName(a, b)
}

/** Preserve the board's ordering in both status and sleeping lanes. */
export function compareWorkspaceKanbanWorktrees(a: Worktree, b: Worktree, sortBy: SortBy): number {
  return sortBy === 'manual'
    ? sortManualBoardWorktrees(a, b)
    : Number(b.isPinned) - Number(a.isPinned) || sortBoardWorktrees(a, b)
}

function sortManualBoardWorktrees(a: Worktree, b: Worktree): number {
  return (
    (b.manualOrder ?? b.sortOrder) - (a.manualOrder ?? a.sortOrder) ||
    compareWorktreeDisplayName(a, b)
  )
}

export function groupWorkspaceKanbanWorktrees(params: {
  worktrees: readonly Worktree[]
  visibleWorktreeIds: ReadonlySet<string>
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  sortBy: SortBy
  sleepingWorktreeIds?: ReadonlySet<string>
}): Map<WorkspaceStatus, Worktree[]> {
  const { worktrees, visibleWorktreeIds, workspaceStatuses, sortBy } = params
  const grouped = new Map<WorkspaceStatus, Worktree[]>(
    workspaceStatuses.map((status) => [status.id, []])
  )

  for (const worktree of worktrees) {
    const identity = getWorktreeHostIdentity(worktree)
    if (!visibleWorktreeIds.has(identity) || params.sleepingWorktreeIds?.has(identity)) {
      continue
    }
    grouped.get(getWorkspaceStatus(worktree, workspaceStatuses))!.push(worktree)
  }

  for (const items of grouped.values()) {
    items.sort((a, b) => compareWorkspaceKanbanWorktrees(a, b, sortBy))
  }
  return grouped
}
