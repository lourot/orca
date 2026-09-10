import type React from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import type { AppState } from '@/store/types'
import type { PendingSidebarRowReveal, PendingSidebarWorktreeReveal } from '@/store/slices/ui'
import type { FolderWorkspace } from '../../../../../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../../../../../shared/project-group-types'
import type { Repo } from '../../../../../../shared/repo-types'
import type { WorkspaceStatusDefinition, Worktree } from '../../../../../../shared/worktree/types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import type { ExecutionHostId } from '../../../../../../shared/execution-host'
import type { RenderRow } from '../listing/render-row'
import type { ProjectGroupingModel } from '../grouping/project-grouping'
import type { PinnedWorktreeDisplayPolicy, WorktreeGroupBy } from '../grouping/row-types'
import {
  collectCollapsedGroupKeysHidingWorkspace,
  type CollapsedGroupsHidingWorkspaceInputs
} from './collapsed-groups-hiding-workspace'

export const MAX_REVEAL_RETRIES = 8

export type PendingSidebarRevealArgs = {
  pendingRevealWorktree: PendingSidebarWorktreeReveal | null
  pendingRevealSidebarRow: PendingSidebarRowReveal | null
  clearPendingRevealWorktreeId: () => void
  clearPendingRevealSidebarRow: () => void
  agentSendTargetWorktreeId: string | null
  renderRows: RenderRow[]
  virtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>
  scrollRef: React.RefObject<HTMLDivElement | null>
  worktrees: Worktree[]
  folderWorkspaces: readonly FolderWorkspace[]
  repoMap: Map<string, Repo>
  worktreeMap: Map<string, Worktree>
  worktreeLineageById: Record<string, WorktreeLineage>
  collapsedGroups: Set<string>
  toggleGroup: (key: string) => void
  groupBy: WorktreeGroupBy
  pinnedDisplayPolicy: PinnedWorktreeDisplayPolicy
  defaultHostId: ExecutionHostId
  prCache: AppState['prCache'] | null
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  settings: AppState['settings']
  projectGroups: readonly ProjectGroup[]
  projectGrouping?: ProjectGroupingModel
  flashRevealedRow: (rowKey: string) => void
  markRevealScroll: (targetTop: number) => void
  schedulePendingRevealFrame: (callback: FrameRequestCallback) => void
  cancelPendingRevealFrames: () => void
}

// Expand whatever collapsed section hides the reveal target, then scroll to it.
export function expandGroupsForWorktreeReveal(
  args: CollapsedGroupsHidingWorkspaceInputs & { toggleGroup: (key: string) => void },
  worktreeId: string,
  executionHostId?: ExecutionHostId
): void {
  for (const groupKey of collectCollapsedGroupKeysHidingWorkspace(
    args,
    worktreeId,
    executionHostId
  )) {
    args.toggleGroup(groupKey)
  }
}

export function resolvePendingSidebarReveal(args: {
  targetIndex: number
  targetWorktreeStillExists: boolean
}): 'scroll-and-clear' | 'clear' | 'keep-pending' {
  if (args.targetIndex !== -1) {
    return 'scroll-and-clear'
  }
  return args.targetWorktreeStillExists ? 'keep-pending' : 'clear'
}
