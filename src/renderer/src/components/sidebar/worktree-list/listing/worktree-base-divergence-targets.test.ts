import { describe, expect, it } from 'vitest'
import {
  probeFirstResolvingBase,
  selectBaseDivergenceTargets
} from './worktree-base-divergence-targets'

const worktree = (
  id: string,
  overrides: { repoId?: string; isMainWorktree?: boolean; isBare?: boolean; baseRef?: string } = {}
) => ({
  id,
  path: `/w/${id}`,
  repoId: overrides.repoId ?? 'unpinned-repo',
  isMainWorktree: overrides.isMainWorktree ?? false,
  isBare: overrides.isBare ?? false,
  baseRef: overrides.baseRef
})

const RESOLVING = new Set(['origin/main', 'noremote/dev'])

const probeFrom = (resolving: ReadonlySet<string>, probed: string[] = []) => {
  return async (baseRef: string) => {
    probed.push(baseRef)
    return resolving.has(baseRef) ? { ahead: 1, behind: 2 } : null
  }
}

describe('worktree base divergence targets', () => {
  it('skips the primary, bare and remote worktrees and orders worktree pin before repo pin', () => {
    const targets = selectBaseDivergenceTargets({
      worktrees: [
        worktree('primary', { isMainWorktree: true }),
        worktree('bare', { isBare: true }),
        worktree('remote', { repoId: 'remote-repo' }),
        worktree('worktree-pin', { repoId: 'pinned-repo', baseRef: 'origin/release' }),
        worktree('same-pin', { repoId: 'pinned-repo', baseRef: ' origin/main ' }),
        worktree('repo-pin', { repoId: 'pinned-repo' }),
        worktree('blank-pin', { repoId: 'pinned-repo', baseRef: '  ' }),
        worktree('commit-pin', { repoId: 'pinned-repo', baseRef: 'a'.repeat(40) }),
        worktree('only-worktree-pin', { baseRef: 'origin/release' }),
        worktree('no-pin')
      ],
      repoMap: new Map([
        ['unpinned-repo', { kind: 'git' as const }],
        ['pinned-repo', { kind: 'git' as const, worktreeBaseRef: 'origin/main' }],
        ['remote-repo', { kind: 'git' as const, connectionId: 'ssh-1', worktreeBaseRef: 'x' }]
      ]),
      getExecutionHostId: () => 'local'
    })

    expect(
      Object.fromEntries(targets.map((target) => [target.worktreeId, target.pinnedBaseRefs]))
    ).toEqual({
      'worktree-pin': ['origin/release', 'origin/main'],
      'same-pin': ['origin/main'],
      'repo-pin': ['origin/main'],
      'blank-pin': ['origin/main'],
      'commit-pin': ['origin/main'],
      'only-worktree-pin': ['origin/release'],
      'no-pin': []
    })
  })

  it('measures against the first base that resolves, falling past a deleted pinned branch', async () => {
    const cases = [
      {
        pinned: ['origin/main', 'noremote/dev'],
        fallback: 'x',
        want: 'origin/main',
        probed: ['origin/main']
      },
      {
        pinned: ['gone', 'noremote/dev'],
        fallback: 'x',
        want: 'noremote/dev',
        probed: ['gone', 'noremote/dev']
      },
      {
        pinned: ['gone'],
        fallback: 'origin/main',
        want: 'origin/main',
        probed: ['gone', 'origin/main']
      },
      { pinned: ['gone'], fallback: 'gone', want: null, probed: ['gone'] },
      { pinned: ['gone'], fallback: null, want: null, probed: ['gone'] }
    ]
    const results = await Promise.all(
      cases.map(async ({ pinned, fallback }) => {
        const probed: string[] = []
        const result = await probeFirstResolvingBase({
          pinnedBaseRefs: pinned,
          resolveDefaultBaseRef: async () => fallback,
          probe: probeFrom(RESOLVING, probed)
        })
        return { want: result?.baseRef ?? null, probed }
      })
    )

    expect(results).toEqual(cases.map(({ want, probed }) => ({ want, probed })))
  })

  it('propagates a failed probe instead of falling through to the next base', async () => {
    const probed: string[] = []
    await expect(
      probeFirstResolvingBase({
        pinnedBaseRefs: ['origin/main', 'noremote/dev'],
        resolveDefaultBaseRef: async () => null,
        probe: async (baseRef) => {
          probed.push(baseRef)
          throw new Error('git failed')
        }
      })
    ).rejects.toThrow('git failed')
    expect(probed).toEqual(['origin/main'])
  })
})
