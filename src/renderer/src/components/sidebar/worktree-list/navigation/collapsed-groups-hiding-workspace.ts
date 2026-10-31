import type { AppState } from '@/store/types'
import type { FolderWorkspace } from '../../../../../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../../../../../shared/project-group-types'
import type { Repo } from '../../../../../../shared/repo-types'
import type { WorkspaceStatusDefinition, Worktree } from '../../../../../../shared/worktree/types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import type { ExecutionHostId } from '../../../../../../shared/execution-host'
import type { ProjectGroupingModel } from '../../../../../../shared/project-section-grouping'
import type { WorktreeOccurrencePlan } from '../../../../../../shared/worktree-occurrence-plan'
import type {
  PinnedWorktreeDisplayPolicy,
  WorktreeGroupBy
} from '../../../../../../shared/sidebar-list/row-types'
import { getFolderWorkspaceRevealGroupKeys } from './folder-reveal'
import { getWorktreeRevealCollapsedGroupKeys } from './worktree-reveal-group-keys'
import { selectFolderWorkspaces } from '@/store/workspace-record-selectors'

/** State this computation reads, narrow enough to build outside the sidebar component tree. */
export type CollapsedGroupsHidingWorkspaceInputs = {
  occurrencePlan?: WorktreeOccurrencePlan<Worktree>
  worktrees: readonly Worktree[]
  folderWorkspaces: readonly FolderWorkspace[]
  repoMap: Map<string, Repo>
  worktreeMap: Map<string, Worktree>
  worktreeLineageById: Record<string, WorktreeLineage>
  collapsedGroups: Set<string>
  /** Whether section collapse keys are scoped per host (a host filter is active). */
  hostScopedGroups: boolean
  groupBy: WorktreeGroupBy
  pinnedDisplayPolicy: PinnedWorktreeDisplayPolicy
  defaultHostId: ExecutionHostId
  prCache: AppState['prCache'] | null
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  settings: AppState['settings']
  projectGroups: readonly ProjectGroup[]
  projectGrouping?: ProjectGroupingModel
}

/**
 * Every currently-collapsed group key that hides the workspace: folder-workspace keys, else the
 * host section, lineage ancestors and section path. Callers toggle these, and a toggle is its own
 * inverse — the keys stay unique because each source uses its own prefix.
 */
export function collectCollapsedGroupKeysHidingWorkspace(
  inputs: CollapsedGroupsHidingWorkspaceInputs,
  worktreeId: string,
  executionHostId?: ExecutionHostId
): string[] {
  const folderGroupKeys = getFolderWorkspaceRevealGroupKeys(
    worktreeId,
    selectFolderWorkspaces(inputs),
    inputs.projectGroups,
    {
      groupBy: inputs.groupBy,
      workspaceStatuses: inputs.workspaceStatuses,
      defaultHostId: inputs.defaultHostId,
      hostScopedGroups: inputs.hostScopedGroups,
      executionHostId
    }
  )
  if (folderGroupKeys.length > 0) {
    return folderGroupKeys.filter((groupKey) => inputs.collapsedGroups.has(groupKey))
  }
  const targetWorktree = inputs.worktrees.find(
    (worktree) =>
      worktree.id === worktreeId &&
      (!executionHostId || !worktree.hostId || worktree.hostId === executionHostId)
  )
  if (!targetWorktree) {
    return []
  }
  return getWorktreeRevealCollapsedGroupKeys({ ...inputs, worktree: targetWorktree })
}
