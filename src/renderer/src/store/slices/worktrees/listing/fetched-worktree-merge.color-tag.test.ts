import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../../../shared/worktree/types'

const isColorTagPersistencePending = vi.fn<(worktreeId: string) => boolean>()

vi.mock('../metadata/worktree-meta-persist', () => ({
  isColorTagPersistencePending: (worktreeId: string) => isColorTagPersistencePending(worktreeId),
  isDisplayNamePersistencePending: () => false
}))

function makeWorktree(id: string, colorTag: string | null): Worktree {
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
    colorTag
  }
}

describe('preserveConcurrentColorTag', () => {
  beforeEach(() => {
    isColorTagPersistencePending.mockReset()
  })

  it('keeps the optimistic color while its write is in flight', async () => {
    const { preserveConcurrentColorTag } = await import('./fetched-worktree-merge')
    isColorTagPersistencePending.mockReturnValue(true)

    const merged = preserveConcurrentColorTag(
      [makeWorktree('a', null)],
      [makeWorktree('a', '#ef4444')],
      () => true
    )

    expect(merged[0].colorTag).toBe('#ef4444')
  })

  it('accepts the listing once no write is pending', async () => {
    const { preserveConcurrentColorTag } = await import('./fetched-worktree-merge')
    isColorTagPersistencePending.mockReturnValue(false)

    const merged = preserveConcurrentColorTag(
      [makeWorktree('a', null)],
      [makeWorktree('a', '#ef4444')],
      () => true
    )

    expect(merged[0].colorTag).toBeNull()
  })

  it('carries an in-flight clear, not just an in-flight color', async () => {
    const { preserveConcurrentColorTag } = await import('./fetched-worktree-merge')
    isColorTagPersistencePending.mockReturnValue(true)

    const merged = preserveConcurrentColorTag(
      [makeWorktree('a', '#ef4444')],
      [makeWorktree('a', null)],
      () => true
    )

    expect(merged[0].colorTag).toBeNull()
  })

  it('leaves rows the refresh host does not own alone', async () => {
    const { preserveConcurrentColorTag } = await import('./fetched-worktree-merge')
    isColorTagPersistencePending.mockReturnValue(true)

    const merged = preserveConcurrentColorTag(
      [makeWorktree('a', null)],
      [makeWorktree('a', '#ef4444')],
      () => false
    )

    expect(merged[0].colorTag).toBeNull()
  })
})
