import { describe, it, expect } from 'vitest'
import { DiffCommentSchema } from './diff-comment-schema'
import type { DiffComment } from './diff-comment-types'

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

describe('DiffCommentSchema', () => {
  // Why: z.object strips unknown keys, so an unlisted field is lost on every
  // folder-workspace save with no error anywhere.
  it('round-trips every reviewed-comparison shape and the file source', () => {
    const inputs: DiffComment[] = [
      note({
        source: 'file',
        reviewedComparison: { kind: 'uncommitted', compares: 'worktree-vs-head' }
      }),
      note({
        reviewedComparison: {
          kind: 'branch',
          baseRef: 'origin/main',
          compareRef: 'HEAD',
          mergeBase: 'a1',
          headOid: 'b2'
        }
      }),
      note({
        reviewedComparison: { kind: 'commit', commitOid: 'c3', parentOid: 'd4' }
      }),
      note({ source: 'markdown' })
    ]
    expect(inputs.map((input) => DiffCommentSchema.parse(input))).toEqual(inputs)
  })

  it('rejects a comparison kind it does not know', () => {
    expect(
      DiffCommentSchema.safeParse(note({ reviewedComparison: { kind: 'tag' } as never })).success
    ).toBe(false)
  })
})
