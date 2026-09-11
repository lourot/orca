import type { AppState } from '@/store/types'
import type { FolderWorkspace } from '../../../../../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../../../../../shared/project-group-types'
import type { Repo } from '../../../../../../shared/repo-types'
import type { WorkspaceStatusDefinition, Worktree } from '../../../../../../shared/worktree/types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import type { ExecutionHostId } from '../../../../../../shared/execution-host'
import { getWorktreeExecutionHostId } from '../../../../../../shared/execution-host'
import { getWorktreeLineageGroupKey } from '../grouping/group-keys'
import type { ProjectGroupingModel } from '../grouping/project-grouping'
import type { PinnedWorktreeDisplayPolicy, WorktreeGroupBy } from '../grouping/row-types'
import { getGroupKeysForWorktree } from '../grouping/worktree-group-keys'
import { isPinnedSectionWorktree } from '../../pinned-section-worktrees'
import { getWorktreeLineageAncestors } from '../../worktree-lineage-projection'
import { getFolderWorkspaceRevealGroupKeys } from './folder-reveal'
import { getPinnedWorktreeRevealCollapsedGroupKeys } from './reveal-ancestors'

/** State this computation reads, narrow enough to build outside the sidebar component tree. */
export type CollapsedGroupsHidingWorkspaceInputs = {
  worktrees: readonly Worktree[]
  folderWorkspaces: readonly FolderWorkspace[]
  repoMap: Map<string, Repo>
  worktreeMap: Map<string, Worktree>
  worktreeLineageById: Record<string, WorktreeLineage>
  collapsedGroups: Set<string>
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
 * Every currently-collapsed group key that hides the workspace: folder-workspace keys,
 * the host section, lineage ancestors, then the pinned section or the `groupBy` keys.
 * Callers toggle these, and a toggle is its own inverse — the keys stay unique because
 * each source uses its own prefix (`host:`, `lineage:`, `project-group:`, ...).
 */
export function collectCollapsedGroupKeysHidingWorkspace(
  inputs: CollapsedGroupsHidingWorkspaceInputs,
  worktreeId: string,
  executionHostId?: ExecutionHostId
): string[] {
  const collapsedKeys: string[] = []
  const addIfCollapsed = (groupKey: string): void => {
    if (inputs.collapsedGroups.has(groupKey)) {
      collapsedKeys.push(groupKey)
    }
  }

  const folderGroupKeys = getFolderWorkspaceRevealGroupKeys(
    worktreeId,
    inputs.folderWorkspaces,
    inputs.projectGroups,
    {
      groupBy: inputs.groupBy,
      workspaceStatuses: inputs.workspaceStatuses,
      defaultHostId: inputs.defaultHostId
    }
  )
  if (folderGroupKeys.length > 0) {
    for (const groupKey of folderGroupKeys) {
      addIfCollapsed(groupKey)
    }
    return collapsedKeys
  }
  const targetWorktree = inputs.worktrees.find(
    (worktree) =>
      worktree.id === worktreeId &&
      (!executionHostId || !worktree.hostId || worktree.hostId === executionHostId)
  )
  if (!targetWorktree) {
    return collapsedKeys
  }
  const targetRepo = inputs.repoMap.get(targetWorktree.repoId)
  addIfCollapsed(
    `host:${getWorktreeExecutionHostId(targetWorktree, targetRepo, inputs.defaultHostId)}`
  )

  const hostWorktreeMap = new Map<string, Worktree>()
  const hostLineageById: Record<string, WorktreeLineage> = {}
  for (const worktree of inputs.worktrees) {
    if (executionHostId && worktree.hostId && worktree.hostId !== executionHostId) {
      continue
    }
    hostWorktreeMap.set(worktree.id, worktree)
    const projected = inputs.worktreeLineageById[worktree.id]
    const inline = (worktree as Worktree & { lineage?: WorktreeLineage | null }).lineage
    const lineage = projected?.worktreeInstanceId === worktree.instanceId ? projected : inline
    if (lineage) {
      hostLineageById[worktree.id] = lineage
    }
  }
  for (const parent of getWorktreeLineageAncestors(
    targetWorktree,
    hostLineageById,
    hostWorktreeMap
  )) {
    addIfCollapsed(getWorktreeLineageGroupKey(parent))
  }

  const groupKeys =
    inputs.pinnedDisplayPolicy === 'single-location' &&
    isPinnedSectionWorktree(
      targetWorktree,
      inputs.worktrees,
      inputs.worktreeLineageById,
      inputs.worktreeMap
    )
      ? getPinnedWorktreeRevealCollapsedGroupKeys({
          worktree: targetWorktree,
          collapsedGroups: inputs.collapsedGroups,
          inPinnedSection: true
        })
      : getGroupKeysForWorktree(
          inputs.groupBy,
          targetWorktree,
          inputs.repoMap,
          inputs.prCache,
          inputs.workspaceStatuses,
          inputs.settings,
          inputs.projectGroups,
          inputs.projectGrouping
        )
  for (const groupKey of groupKeys) {
    addIfCollapsed(groupKey)
  }
  return collapsedKeys
}
