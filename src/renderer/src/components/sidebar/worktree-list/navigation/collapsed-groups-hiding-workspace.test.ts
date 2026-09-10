import { describe, expect, it } from 'vitest'
import type { AppState } from '@/store/types'
import type { FolderWorkspace } from '../../../../../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../../../../../shared/project-group-types'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { WorktreeLineage } from '../../../../../../shared/worktree/lineage-types'
import { folderWorkspaceKey } from '../../../../../../shared/workspace-scope'
import { getLineageGroupKey, getProjectGroupHeaderKey } from '../grouping/group-keys'
import {
  collectCollapsedGroupKeysHidingWorkspace,
  type CollapsedGroupsHidingWorkspaceInputs
} from './collapsed-groups-hiding-workspace'
import { expandGroupsForWorktreeReveal } from './pending-reveal-inputs'

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'worktree-1',
    repoId: 'repo-1',
    path: '/workspace/repo/worktree-1',
    displayName: 'worktree-1',
    branch: 'worktree-1',
    head: 'abc123',
    isBare: false,
    isMainWorktree: false,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    linkedGitLabMR: null,
    linkedGitLabIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 1,
    lastActivityAt: 1,
    ...overrides
  }
}

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-1',
    path: '/workspace/repo',
    displayName: 'repo',
    badgeColor: '#000000',
    addedAt: 1,
    ...overrides
  }
}

function makeProjectGroup(overrides: Partial<ProjectGroup>): ProjectGroup {
  return {
    id: 'group-1',
    name: 'Platform',
    parentPath: '/workspace/platform',
    parentGroupId: null,
    createdFrom: 'manual',
    tabOrder: 1,
    isCollapsed: false,
    color: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

function makeFolderWorkspace(overrides: Partial<FolderWorkspace> = {}): FolderWorkspace {
  return {
    id: 'folder-workspace-1',
    projectGroupId: 'group-child',
    name: 'Refund workflow',
    folderPath: '/workspace/platform',
    linkedTask: null,
    comment: '',
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 1,
    lastActivityAt: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

function makeInputs(
  overrides: Partial<CollapsedGroupsHidingWorkspaceInputs> = {}
): CollapsedGroupsHidingWorkspaceInputs {
  const worktrees = overrides.worktrees ?? [makeWorktree()]
  return {
    worktrees,
    folderWorkspaces: [],
    repoMap: new Map([['repo-1', makeRepo()]]),
    worktreeMap: new Map(worktrees.map((worktree) => [worktree.id, worktree])),
    worktreeLineageById: {},
    collapsedGroups: new Set<string>(),
    groupBy: 'repo',
    pinnedDisplayPolicy: 'duplicate-in-groups',
    defaultHostId: 'local',
    prCache: null,
    workspaceStatuses: [],
    settings: {} as AppState['settings'],
    projectGroups: [],
    ...overrides
  }
}

describe('collectCollapsedGroupKeysHidingWorkspace', () => {
  it('returns the collapsed project-group and repo keys hiding a worktree', () => {
    const group = makeProjectGroup({ id: 'group-1' })
    const keys = collectCollapsedGroupKeysHidingWorkspace(
      makeInputs({
        repoMap: new Map([['repo-1', makeRepo({ projectGroupId: group.id })]]),
        projectGroups: [group],
        collapsedGroups: new Set([getProjectGroupHeaderKey(group.id), 'repo:repo-1'])
      }),
      'worktree-1'
    )

    expect(keys).toEqual([getProjectGroupHeaderKey(group.id), 'repo:repo-1'])
  })

  it('returns nothing when every group hiding the worktree is already expanded', () => {
    const group = makeProjectGroup({ id: 'group-1' })
    const keys = collectCollapsedGroupKeysHidingWorkspace(
      makeInputs({
        repoMap: new Map([['repo-1', makeRepo({ projectGroupId: group.id })]]),
        projectGroups: [group]
      }),
      'worktree-1'
    )

    expect(keys).toEqual([])
  })

  it('walks nested project-group ancestors from root to owner', () => {
    const root = makeProjectGroup({ id: 'group-root', name: 'Company' })
    const child = makeProjectGroup({ id: 'group-child', parentGroupId: root.id })
    const keys = collectCollapsedGroupKeysHidingWorkspace(
      makeInputs({
        repoMap: new Map([['repo-1', makeRepo({ projectGroupId: child.id })]]),
        projectGroups: [child, root],
        collapsedGroups: new Set([
          getProjectGroupHeaderKey(root.id),
          getProjectGroupHeaderKey(child.id)
        ])
      }),
      'worktree-1'
    )

    expect(keys).toEqual([getProjectGroupHeaderKey(root.id), getProjectGroupHeaderKey(child.id)])
  })

  it('returns folder-workspace keys and stops before the git-worktree lookup', () => {
    // Folder workspaces are not git worktrees, so the lookup below would find nothing.
    const group = makeProjectGroup({ id: 'group-child' })
    const folderWorkspace = makeFolderWorkspace({ projectGroupId: group.id })
    const keys = collectCollapsedGroupKeysHidingWorkspace(
      makeInputs({
        folderWorkspaces: [folderWorkspace],
        projectGroups: [group],
        collapsedGroups: new Set([getProjectGroupHeaderKey(group.id), 'host:local'])
      }),
      folderWorkspaceKey(folderWorkspace.id)
    )

    expect(keys).toEqual([getProjectGroupHeaderKey(group.id), 'host:local'])
  })

  it('returns the collapsed host section key', () => {
    const keys = collectCollapsedGroupKeysHidingWorkspace(
      makeInputs({ collapsedGroups: new Set(['host:local']) }),
      'worktree-1'
    )

    expect(keys).toEqual(['host:local'])
  })

  it('returns collapsed lineage ancestor keys', () => {
    const parent = makeWorktree({ id: 'parent-1', instanceId: 'parent-instance' })
    const child = makeWorktree({ id: 'child-1', instanceId: 'child-instance' })
    const lineage: WorktreeLineage = {
      worktreeId: child.id,
      worktreeInstanceId: 'child-instance',
      parentWorktreeId: parent.id,
      parentWorktreeInstanceId: 'parent-instance',
      origin: 'cli',
      capture: { source: 'explicit-cli-flag', confidence: 'explicit' },
      createdAt: 1
    }
    const keys = collectCollapsedGroupKeysHidingWorkspace(
      makeInputs({
        worktrees: [parent, child],
        worktreeLineageById: { [child.id]: lineage },
        collapsedGroups: new Set([getLineageGroupKey(parent.id)])
      }),
      child.id
    )

    expect(keys).toEqual([getLineageGroupKey(parent.id)])
  })

  it('returns the pinned section key instead of group keys under single-location pinning', () => {
    const group = makeProjectGroup({ id: 'group-1' })
    const pinned = makeWorktree({ isPinned: true })
    const keys = collectCollapsedGroupKeysHidingWorkspace(
      makeInputs({
        worktrees: [pinned],
        repoMap: new Map([['repo-1', makeRepo({ projectGroupId: group.id })]]),
        projectGroups: [group],
        pinnedDisplayPolicy: 'single-location',
        collapsedGroups: new Set(['pinned', getProjectGroupHeaderKey(group.id), 'repo:repo-1'])
      }),
      pinned.id
    )

    expect(keys).toEqual(['pinned'])
  })

  it('returns nothing for a workspace id that matches no worktree', () => {
    const keys = collectCollapsedGroupKeysHidingWorkspace(
      makeInputs({ collapsedGroups: new Set(['host:local', 'repo:repo-1']) }),
      'missing-worktree'
    )

    expect(keys).toEqual([])
  })

  it('toggles through expandGroupsForWorktreeReveal exactly the keys it collects', () => {
    const group = makeProjectGroup({ id: 'group-1' })
    const inputs = makeInputs({
      repoMap: new Map([['repo-1', makeRepo({ projectGroupId: group.id })]]),
      projectGroups: [group],
      collapsedGroups: new Set(['host:local', getProjectGroupHeaderKey(group.id), 'repo:repo-1'])
    })
    const toggled: string[] = []

    expandGroupsForWorktreeReveal(
      {
        ...inputs,
        toggleGroup: (key) => {
          toggled.push(key)
        }
      },
      'worktree-1'
    )

    expect(toggled).toEqual(collectCollapsedGroupKeysHidingWorkspace(inputs, 'worktree-1'))
    expect(toggled).toEqual(['host:local', getProjectGroupHeaderKey(group.id), 'repo:repo-1'])
  })
})
