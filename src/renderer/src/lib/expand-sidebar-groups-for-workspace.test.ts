import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import type { Worktree } from '../../../shared/worktree/types'

const toggleCollapsedGroup = vi.fn<(key: string) => void>()
let state: Record<string, unknown> = {}

vi.mock('@/store', () => ({
  useAppStore: { getState: () => state }
}))

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

const repo: Repo = {
  id: 'repo-1',
  path: '/workspace/repo',
  displayName: 'repo',
  badgeColor: '#000000',
  addedAt: 1
}

function setState(worktrees: Worktree[], collapsedGroups: string[]): void {
  state = {
    repos: [repo],
    worktreesByRepo: { 'repo-1': worktrees },
    folderWorkspaces: [],
    worktreeLineageById: {},
    collapsedGroups: new Set(collapsedGroups),
    groupBy: 'repo',
    prCache: null,
    workspaceStatuses: [],
    settings: {},
    projectGroups: [],
    toggleCollapsedGroup
  }
}

async function expand(target: Worktree | string): Promise<void> {
  const { expandSidebarGroupsForWorkspace } = await import('./expand-sidebar-groups-for-workspace')
  expandSidebarGroupsForWorkspace(target)
}

describe('expandSidebarGroupsForWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('un-collapses every group hiding the workspace', async () => {
    // 'project:repo:repo-1' rather than 'repo:repo-1': the store synthesizes a
    // project per repo, and the caller must pass that projection through.
    setState([makeWorktree()], ['host:local', 'project:repo:repo-1'])

    await expand('worktree-1')

    expect(toggleCollapsedGroup.mock.calls.flat()).toEqual(['host:local', 'project:repo:repo-1'])
  })

  it('leaves an already-visible workspace alone', async () => {
    setState([makeWorktree()], [])

    await expand('worktree-1')

    expect(toggleCollapsedGroup).not.toHaveBeenCalled()
  })

  it('expands for a workspace the store has not indexed yet', async () => {
    // A new_per_run workspace is created moments before dispatch; looking it up
    // by id would find nothing and expand nothing.
    setState([], ['host:local', 'project:repo:repo-1'])

    await expand(makeWorktree({ id: 'fresh-worktree' }))

    expect(toggleCollapsedGroup.mock.calls.flat()).toEqual(['host:local', 'project:repo:repo-1'])
  })

  it('expands nothing for an id the store does not know', async () => {
    setState([], ['host:local', 'project:repo:repo-1'])

    await expand('fresh-worktree')

    expect(toggleCollapsedGroup).not.toHaveBeenCalled()
  })
})
