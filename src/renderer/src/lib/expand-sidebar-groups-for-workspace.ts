import { useAppStore } from '@/store'
import {
  getAllWorktreesFromState,
  getProjectHostSetupProjectionFromState,
  getRepoMapFromState,
  getWorktreeMapFromState
} from '@/store/selectors'
import { collectCollapsedGroupKeysHidingWorkspace } from '@/components/sidebar/worktree-list/navigation/collapsed-groups-hiding-workspace'
import { getPinnedWorktreeDisplayPolicy } from '@/components/sidebar/worktree-list/grouping/row-types'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { getSettingsFocusedExecutionHostId } from '../../../shared/execution-host'
import type { Worktree } from '../../../shared/worktree/types'

/**
 * Un-collapse every sidebar group hiding `target`, persistently. Expand only —
 * no scroll, no activation.
 *
 * Pass the `Worktree` rather than its id whenever the caller holds one: a workspace
 * created moments ago may not have reached `worktreesByRepo` yet, and the lookup
 * would silently find nothing.
 */
export function expandSidebarGroupsForWorkspace(
  target: Worktree | string,
  executionHostId?: ExecutionHostId
): void {
  const state = useAppStore.getState()
  const worktreeId = typeof target === 'string' ? target : target.id
  // One id can name a row on two hosts, so narrow to the caller's host when known.
  const hostId = executionHostId ?? (typeof target === 'string' ? undefined : target.hostId)
  const storeWorktrees = getAllWorktreesFromState(state)
  const worktrees =
    typeof target === 'string' || storeWorktrees.some((worktree) => worktree.id === target.id)
      ? storeWorktrees
      : [...storeWorktrees, target]
  const projection = getProjectHostSetupProjectionFromState(state)

  const collapsedGroupKeys = collectCollapsedGroupKeysHidingWorkspace(
    {
      worktrees,
      folderWorkspaces: state.folderWorkspaces,
      repoMap: getRepoMapFromState(state),
      // The store's own map, not a copy: the lineage projection caches on its identity.
      worktreeMap: getWorktreeMapFromState(state),
      worktreeLineageById: state.worktreeLineageById,
      collapsedGroups: state.collapsedGroups,
      groupBy: state.groupBy,
      pinnedDisplayPolicy: getPinnedWorktreeDisplayPolicy(state.settings),
      defaultHostId: getSettingsFocusedExecutionHostId(state.settings),
      prCache: state.prCache,
      workspaceStatuses: state.workspaceStatuses,
      settings: state.settings,
      projectGroups: state.projectGroups ?? [],
      projectGrouping: {
        projects: projection.projects,
        projectHostSetups: projection.setups
      }
    },
    worktreeId,
    hostId
  )

  for (const groupKey of collapsedGroupKeys) {
    state.toggleCollapsedGroup(groupKey)
  }
}
