import { describe, it, expect } from 'vitest'
import type { DiffComment } from '../../../../shared/diff-comment-types'
import { normalizeDiffComment } from './diff-comment-persistence'

function note(overrides: Partial<DiffComment> = {}): DiffComment {
  return {
    id: 'id-1',
    worktreeId: 'wt-1',
    filePath: 'src/app.ts',
    lineNumber: 10,
    body: 'Needs validation',
    createdAt: 0,
    side: 'modified',
    ...overrides
  }
}

describe('normalizeDiffComment', () => {
  // Why: this runs on every add and on every write back to disk, and it rebuilds
  // `source` rather than passing it through. A source it does not list is
  // downgraded to a diff note, which hides the note from the editor that made it.
  it('keeps every known note source', () => {
    const sources = ['diff', 'markdown', 'file'] as const
    expect(sources.map((source) => normalizeDiffComment(note({ source })).source)).toEqual([
      ...sources
    ])
  })

  it('drops a source it does not know', () => {
    expect(normalizeDiffComment(note({ source: 'gutter' as never })).source).toBeUndefined()
  })

  it('keeps a well-formed reviewed comparison and drops a malformed one', () => {
    const reviewedComparison = {
      kind: 'branch',
      baseRef: 'origin/main',
      compareRef: 'HEAD',
      mergeBase: 'a1',
      headOid: 'b2'
    } as const
    expect(normalizeDiffComment(note({ reviewedComparison })).reviewedComparison).toEqual(
      reviewedComparison
    )
    expect(
      normalizeDiffComment(note({ reviewedComparison: { kind: 'branch' } as never }))
        .reviewedComparison
    ).toBeUndefined()
  })
})
