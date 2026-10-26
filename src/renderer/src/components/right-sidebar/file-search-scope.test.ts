import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { getFileSearchRoots } from './file-search-scope'

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-local',
    path: '/projects/local',
    displayName: 'Local',
    badgeColor: '#111111',
    addedAt: 1,
    ...overrides
  }
}

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'repo-local::/projects/local',
    repoId: 'repo-local',
    path: '/projects/local',
    head: 'head',
    branch: 'main',
    isBare: false,
    isMainWorktree: true,
    displayName: 'main',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    ...overrides
  }
}

describe('getFileSearchRoots', () => {
  it('returns every local primary checkout while excluding remote and folder repos', () => {
    const repos = [
      makeRepo(),
      makeRepo({
        id: 'repo-remote',
        path: '/remote/repo',
        displayName: 'Remote',
        connectionId: 'ssh-1'
      }),
      makeRepo({
        id: 'repo-folder',
        path: '/projects/folder',
        displayName: 'Folder',
        kind: 'folder'
      }),
      makeRepo({ id: 'repo-second', path: '/projects/second', displayName: 'Second' })
    ]

    expect(
      getFileSearchRoots('all-primary', null, {
        repos,
        worktreesByRepo: {}
      }).map((root) => root.path)
    ).toEqual(['/projects/local', '/projects/second'])
  })

  it('includes linked worktrees and adds a missing primary checkout once', () => {
    const repo = makeRepo()
    const linked = makeWorktree({
      id: 'repo-local::/worktrees/feature',
      path: '/worktrees/feature',
      displayName: 'feature',
      isMainWorktree: false
    })
    const remote = makeWorktree({
      id: 'repo-local::/remote/feature',
      path: '/remote/feature',
      displayName: 'remote feature',
      hostId: 'ssh:ssh-1'
    })

    expect(
      getFileSearchRoots('all-worktrees', null, {
        repos: [repo],
        worktreesByRepo: { [repo.id]: [linked, remote] }
      }).map((root) => root.path)
    ).toEqual(['/worktrees/feature', '/projects/local'])
  })

  it('returns only the active local worktree for the current scope', () => {
    const repo = makeRepo()
    const main = makeWorktree()
    const linked = makeWorktree({
      id: 'repo-local::/worktrees/feature',
      path: '/worktrees/feature',
      displayName: 'feature',
      isMainWorktree: false
    })

    expect(
      getFileSearchRoots('current', linked.id, {
        repos: [repo],
        worktreesByRepo: { [repo.id]: [main, linked] }
      })
    ).toEqual([
      expect.objectContaining({
        id: `worktree:${linked.id}`,
        path: linked.path,
        worktreeName: 'feature'
      })
    ])
  })

  it('keeps the existing current-worktree search available for remote worktrees', () => {
    const repo = makeRepo({ connectionId: 'ssh-1' })
    const remote = makeWorktree({
      id: 'repo-local::/remote/repo',
      path: '/remote/repo',
      hostId: 'ssh:ssh-1'
    })

    expect(
      getFileSearchRoots('current', remote.id, {
        repos: [repo],
        worktreesByRepo: { [repo.id]: [remote] }
      })
    ).toEqual([expect.objectContaining({ path: remote.path })])
  })
})
