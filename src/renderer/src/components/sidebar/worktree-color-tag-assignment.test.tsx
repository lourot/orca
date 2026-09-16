// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'
import { useWorktreeContextMenuCommands } from './use-worktree-context-menu-commands'

vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorktree: vi.fn() }))
vi.mock('./sleep-worktree-flow', () => ({ runSleepWorktrees: vi.fn() }))

function makeWorktree(id: string, overrides: Partial<Worktree> = {}): Worktree {
  return {
    id,
    repoId: 'repo-1',
    path: `/repo/worktrees/${id}`,
    displayName: id,
    branch: id,
    head: 'abc123',
    isBare: false,
    isMainWorktree: false,
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

function renderCommands(activeContextWorktrees: readonly Worktree[]) {
  const updateWorktreeMeta = vi.fn().mockResolvedValue({ ok: true })
  const setMenuOpenState = vi.fn()
  const { result } = renderHook(() =>
    useWorktreeContextMenuCommands({
      activeContextWorktrees,
      batchDeleteWorktrees: [],
      createGroupDialogActiveRef: { current: false },
      createProjectGroup: vi.fn(),
      folderWorkspaceId: null,
      isMultiContext: activeContextWorktrees.length > 1,
      moveProjectToGroup: vi.fn(),
      openModal: vi.fn(),
      repo: null,
      scopeRef: { current: null },
      setCreateGroupDialogOpen: vi.fn(),
      setMenuOpenState,
      setWorktreesPinnedAndReveal: vi.fn(),
      sleepableWorktrees: [],
      subtreeSleepableWorktrees: [],
      updateWorktreeMeta,
      validParentWorktreeId: null,
      worktree: activeContextWorktrees[0],
      workspaceStatuses: []
    } as unknown as Parameters<typeof useWorktreeContextMenuCommands>[0])
  )
  return { result, updateWorktreeMeta, setMenuOpenState }
}

describe('worktree color tag assignment', () => {
  it('writes the color to every workspace in the selection, not just the right-clicked one', () => {
    const worktrees = [
      makeWorktree('a', { hostId: 'local' }),
      makeWorktree('b', { hostId: 'ssh:box' }),
      makeWorktree('c')
    ]
    const { result, updateWorktreeMeta } = renderCommands(worktrees)

    result.current.handleAssignColorTag('#ef4444')

    expect(updateWorktreeMeta).toHaveBeenCalledTimes(3)
    expect(updateWorktreeMeta.mock.calls.map((call) => call[0])).toEqual(['a', 'b', 'c'])
    expect(updateWorktreeMeta.mock.calls.map((call) => call[1])).toEqual([
      { colorTag: '#ef4444' },
      { colorTag: '#ef4444' },
      { colorTag: '#ef4444' }
    ])
    // Each row is written on its own host, and a row without one falls back to local.
    expect(updateWorktreeMeta.mock.calls.map((call) => call[2])).toEqual([
      { executionHostId: 'local' },
      { executionHostId: 'ssh:box' },
      { executionHostId: 'local' }
    ])
  })

  it('sends a clear as null rather than dropping the key', () => {
    const { result, updateWorktreeMeta } = renderCommands([makeWorktree('a')])

    result.current.handleAssignColorTag(null)

    expect(updateWorktreeMeta).toHaveBeenCalledWith('a', { colorTag: null }, expect.anything())
  })

  it('closes the menu before writing', () => {
    const { result, setMenuOpenState } = renderCommands([makeWorktree('a')])

    result.current.handleAssignColorTag('#ef4444')

    expect(setMenuOpenState).toHaveBeenCalledWith(false)
  })
})
