// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRuntimeGitStatus: vi.fn()
}))

vi.mock('@/runtime/runtime-git-client', () => ({
  getRuntimeGitStatus: mocks.getRuntimeGitStatus
}))

vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({}) }
}))

vi.mock('@/lib/connection-context', () => ({
  getConnectionId: () => undefined
}))

vi.mock('@/lib/worktree-runtime-owner', () => ({
  getExecutionHostIdForWorktree: () => 'local',
  getSettingsForWorktreeRuntimeOwner: () => ({ activeRuntimeEnvironmentId: null })
}))

import { useProjectUncommittedChanges } from './use-project-uncommitted-changes'

const WORKTREES = [{ id: 'w1', path: '/w/1', repoId: 'repo-1' }]
const REPO_MAP = new Map([['repo-1', { kind: 'git' as const, connectionId: null }]])

function renderSweep() {
  return renderHook(() =>
    useProjectUncommittedChanges({
      worktrees: WORKTREES as never,
      repoMap: REPO_MAP as never
    })
  )
}

/** Lets the mount sweep's promises settle. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

afterEach(() => {
  cleanup()
  mocks.getRuntimeGitStatus.mockReset()
})

describe('useProjectUncommittedChanges', () => {
  it('reports a repo dirty when one of its worktrees has status entries', async () => {
    mocks.getRuntimeGitStatus.mockResolvedValue({ entries: [{ path: 'a.ts' }] })
    const { result } = renderSweep()
    await flush()

    expect([...result.current.dirtyRepoIds]).toEqual(['repo-1'])
  })

  it('reports nothing for a clean worktree', async () => {
    mocks.getRuntimeGitStatus.mockResolvedValue({ entries: [] })
    const { result } = renderSweep()
    await flush()

    expect([...result.current.dirtyRepoIds]).toEqual([])
  })

  it('names the dirty worktree without its clean sibling in the same repo', async () => {
    mocks.getRuntimeGitStatus.mockImplementation((context: { worktreeId: string }) =>
      Promise.resolve({ entries: context.worktreeId === 'w2' ? [{ path: 'a.ts' }] : [] })
    )
    const { result } = renderHook(() =>
      useProjectUncommittedChanges({
        worktrees: [
          { id: 'w1', path: '/w/1', repoId: 'repo-1' },
          { id: 'w2', path: '/w/2', repoId: 'repo-1' }
        ] as never,
        repoMap: REPO_MAP as never
      })
    )
    await flush()

    expect([...result.current.dirtyWorktreeIds]).toEqual(['w2'])
    expect([...result.current.dirtyRepoIds]).toEqual(['repo-1'])
  })

  it('keeps the previous verdict when a later probe fails, instead of reading as clean', async () => {
    mocks.getRuntimeGitStatus.mockResolvedValue({ entries: [{ path: 'a.ts' }] })
    const { result } = renderSweep()
    await flush()
    expect([...result.current.dirtyRepoIds]).toEqual(['repo-1'])

    // A failed probe is not evidence the tree became clean.
    mocks.getRuntimeGitStatus.mockRejectedValue(new Error('git unavailable'))
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    await flush()

    expect([...result.current.dirtyRepoIds]).toEqual(['repo-1'])
    expect([...result.current.dirtyWorktreeIds]).toEqual(['w1'])
  })

  it('skips probing entirely when no worktree is eligible', async () => {
    mocks.getRuntimeGitStatus.mockResolvedValue({ entries: [] })
    renderHook(() =>
      useProjectUncommittedChanges({
        worktrees: [{ id: 'w1', path: '/w/1', repoId: 'folder-repo' }] as never,
        repoMap: new Map([['folder-repo', { kind: 'folder', connectionId: null }]]) as never
      })
    )
    await flush()

    expect(mocks.getRuntimeGitStatus).not.toHaveBeenCalled()
  })
})
