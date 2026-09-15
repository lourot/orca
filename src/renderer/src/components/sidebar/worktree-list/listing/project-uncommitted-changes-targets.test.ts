import { describe, expect, it } from 'vitest'
import type { ExecutionHostId } from '../../../../../../shared/execution-host'
import {
  aggregateDirtyRepoIds,
  selectDirtyWorktreeIds,
  selectProjectUncommittedProbeTargets
} from './project-uncommitted-changes-targets'

type RepoFixture = { kind?: 'git' | 'folder'; connectionId?: string | null }

function selectTargetIds(args: {
  worktrees: { id: string; path: string; repoId: string }[]
  repos: Record<string, RepoFixture>
  hostByWorktreeId?: Record<string, ExecutionHostId>
}): string[] {
  return selectProjectUncommittedProbeTargets({
    worktrees: args.worktrees,
    repoMap: new Map(Object.entries(args.repos)),
    getExecutionHostId: (worktreeId) => args.hostByWorktreeId?.[worktreeId] ?? 'local'
  }).map((target) => target.worktreeId)
}

describe('project uncommitted changes targets', () => {
  it('probes only local git worktrees, and skips every out-of-scope host or repo kind', () => {
    const ids = selectTargetIds({
      worktrees: [
        { id: 'local-git', path: '/w/local-git', repoId: 'git-repo' },
        { id: 'legacy-no-host', path: '/w/legacy', repoId: 'git-repo' },
        { id: 'folder-repo', path: '/w/folder', repoId: 'folder-repo' },
        { id: 'ssh-host', path: '/w/ssh', repoId: 'git-repo' },
        { id: 'runtime-host', path: '/w/runtime', repoId: 'git-repo' },
        { id: 'ssh-repo', path: '/w/ssh-repo', repoId: 'remote-repo' },
        { id: 'no-path', path: '', repoId: 'git-repo' },
        { id: 'unknown-repo', path: '/w/unknown', repoId: 'missing-repo' }
      ],
      repos: {
        'git-repo': { kind: 'git' },
        'folder-repo': { kind: 'folder' },
        // Same local host verdict as the others; only connectionId marks it remote.
        'remote-repo': { kind: 'git', connectionId: 'ssh-1' }
      },
      hostByWorktreeId: {
        'ssh-host': 'ssh:target-1',
        'runtime-host': 'runtime:env-1'
      }
    })

    expect(ids).toEqual(['local-git', 'legacy-no-host'])
  })

  it('treats a repo with no explicit kind as git, matching getRepoKind', () => {
    const ids = selectTargetIds({
      worktrees: [{ id: 'w1', path: '/w/1', repoId: 'untyped' }],
      repos: { untyped: {} }
    })

    expect(ids).toEqual(['w1'])
  })

  it('carries the path and repo id the probe needs', () => {
    const targets = selectProjectUncommittedProbeTargets({
      worktrees: [{ id: 'w1', path: '/w/1', repoId: 'repo-1' }],
      repoMap: new Map([['repo-1', { kind: 'git' as const, connectionId: null }]]),
      getExecutionHostId: () => 'local'
    })

    expect(targets).toEqual([{ worktreeId: 'w1', worktreePath: '/w/1', repoId: 'repo-1' }])
  })

  it('marks a repo dirty from any one of its worktrees and leaves clean repos out', () => {
    const worktrees = [
      { id: 'a1', repoId: 'repo-a' },
      { id: 'a2', repoId: 'repo-a' },
      { id: 'b1', repoId: 'repo-b' },
      { id: 'c1', repoId: 'repo-c' }
    ]
    const dirty = aggregateDirtyRepoIds(
      worktrees,
      new Map([
        ['a1', false],
        ['a2', true],
        ['b1', false]
        // c1 never probed — absent, not false.
      ])
    )

    expect([...dirty]).toEqual(['repo-a'])
  })

  it('does not treat an unprobed worktree as dirty', () => {
    expect([...aggregateDirtyRepoIds([{ id: 'w1', repoId: 'repo-1' }], new Map())]).toEqual([])
  })

  it('names dirty worktrees individually, excluding clean and unprobed ones', () => {
    const dirty = selectDirtyWorktreeIds(
      new Map([
        ['a1', false],
        ['a2', true],
        ['b1', true]
      ])
    )

    expect([...dirty]).toEqual(['a2', 'b1'])
    expect([...selectDirtyWorktreeIds(new Map())]).toEqual([])
  })
})
