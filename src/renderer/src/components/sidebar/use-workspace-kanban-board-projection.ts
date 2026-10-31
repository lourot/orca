import { useLayoutEffect, useMemo } from 'react'
import { useAppStore } from '@/store'
import { useShallow } from 'zustand/react/shallow'
import { selectIsSleepingWorktree } from './use-worktree-sleep-state'
import { useVisibleWorkspaceKanbanWorktreeIds } from './use-visible-workspace-kanban-worktree-ids'
import {
  compareWorkspaceKanbanWorktrees,
  groupWorkspaceKanbanWorktrees
} from './workspace-kanban-worktree-groups'
import { buildWorkspaceKanbanLaneViews } from './workspace-kanban-search'
import { useWorkspaceKanbanSearch } from './use-workspace-kanban-search'
import { registerWorkspaceKanbanSidebarDropGroups } from './workspace-kanban-sidebar-drop'
import { buildUnambiguousWorktreeIdIndex } from './worktree-unambiguous-id-index'
import {
  composeWorktreeHostIdentity,
  getWorktreeHostIdentity
} from '../../../../shared/worktree/host-qualified-identity'
import type { WorkspaceStatusDefinition, Worktree } from '../../../../shared/worktree/types'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { WorktreeDragGroup } from './worktree-manual-order'
import type { useRepoMap } from '@/store/selectors'

export function useWorkspaceKanbanBoardProjection(args: {
  activeWorktreeId: string | null
  activeWorkspaceExecutionHostId: ExecutionHostId | null
  allWorktrees: readonly Worktree[]
  open: boolean
  repoMap: ReturnType<typeof useRepoMap>
  sortBy: ReturnType<typeof useAppStore.getState>['sortBy']
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
}) {
  const visibleWorktreeIds = useVisibleWorkspaceKanbanWorktreeIds({
    allWorktrees: args.allWorktrees,
    repoMap: args.repoMap
  })
  const sleepingIdentities = useAppStore(
    useShallow((state) =>
      args.allWorktrees
        .filter((worktree) => selectIsSleepingWorktree(state, worktree.id))
        .map(getWorktreeHostIdentity)
    )
  )
  const sleepingWorktreeIds = useMemo(() => new Set(sleepingIdentities), [sleepingIdentities])
  const sleepingWorktrees = useMemo(
    () =>
      args.allWorktrees
        .filter((worktree) => {
          const identity = getWorktreeHostIdentity(worktree)
          return visibleWorktreeIds.has(identity) && sleepingWorktreeIds.has(identity)
        })
        .sort((a, b) => compareWorkspaceKanbanWorktrees(a, b, args.sortBy)),
    [args.allWorktrees, args.sortBy, sleepingWorktreeIds, visibleWorktreeIds]
  )
  const worktreesByStatus = useMemo(
    () =>
      groupWorkspaceKanbanWorktrees({
        worktrees: args.allWorktrees,
        visibleWorktreeIds,
        sleepingWorktreeIds,
        workspaceStatuses: args.workspaceStatuses,
        sortBy: args.sortBy
      }),
    [
      args.allWorktrees,
      args.sortBy,
      args.workspaceStatuses,
      visibleWorktreeIds,
      sleepingWorktreeIds
    ]
  )
  const worktreeById = useMemo(
    () => buildUnambiguousWorktreeIdIndex(args.allWorktrees),
    [args.allWorktrees]
  )
  const boardWorktrees = useMemo(
    () => [
      ...sleepingWorktrees,
      ...args.workspaceStatuses.flatMap((status) => worktreesByStatus.get(status.id) ?? [])
    ],
    [args.workspaceStatuses, worktreesByStatus, sleepingWorktrees]
  )
  const boardDragGroups = useMemo<WorktreeDragGroup[]>(
    () =>
      args.workspaceStatuses.map((status) => ({
        key: status.id,
        worktreeIds: (worktreesByStatus.get(status.id) ?? []).map((worktree) => worktree.id)
      })),
    [args.workspaceStatuses, worktreesByStatus]
  )
  useLayoutEffect(() => {
    if (!args.open) {
      return
    }
    return registerWorkspaceKanbanSidebarDropGroups(boardDragGroups)
  }, [args.open, boardDragGroups])
  const laneFullWorktreeIds = useMemo(
    () => new Map(boardDragGroups.map((group) => [group.key, group.worktreeIds])),
    [boardDragGroups]
  )
  const search = useWorkspaceKanbanSearch({
    open: args.open,
    worktrees: boardWorktrees,
    repoMap: args.repoMap
  })
  const laneViews = useMemo(
    () =>
      buildWorkspaceKanbanLaneViews({
        worktreesByStatus,
        matchingWorktreeIds: search.matchingWorktreeIds
      }),
    [search.matchingWorktreeIds, worktreesByStatus]
  )
  const renderedBoardWorktrees = useMemo(
    () =>
      search.matchingWorktreeIds
        ? boardWorktrees.filter((worktree) =>
            search.matchingWorktreeIds?.has(getWorktreeHostIdentity(worktree))
          )
        : boardWorktrees,
    [boardWorktrees, search.matchingWorktreeIds]
  )
  const sleepingLaneView = useMemo(
    () => ({
      items: search.matchingWorktreeIds
        ? sleepingWorktrees.filter((worktree) =>
            search.matchingWorktreeIds?.has(getWorktreeHostIdentity(worktree))
          )
        : sleepingWorktrees,
      totalCount: sleepingWorktrees.length
    }),
    [search.matchingWorktreeIds, sleepingWorktrees]
  )
  const activeWorktreeIdentity = args.activeWorktreeId
    ? composeWorktreeHostIdentity(
        args.activeWorkspaceExecutionHostId ?? undefined,
        args.activeWorktreeId
      )
    : null
  return {
    activeWorktreeIdentity,
    boardDragGroups,
    boardWorktrees,
    laneFullWorktreeIds,
    laneViews,
    renderedBoardWorktrees,
    search,
    worktreeById,
    worktreesByStatus,
    sleepingLaneView,
    sleepingWorktreeIds
  }
}
