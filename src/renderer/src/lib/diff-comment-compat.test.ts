import { describe, expect, it } from 'vitest'
import type { DiffComment } from '../../../shared/diff-comment-types'
import {
  getDiffCommentLineLabel,
  getDiffCommentSource,
  isDiffComment,
  isEditorComment,
  isMarkdownComment
} from './diff-comment-compat'

function makeComment(overrides: Partial<DiffComment> = {}): DiffComment {
  return {
    id: 'c1',
    worktreeId: 'wt1',
    filePath: 'README.md',
    lineNumber: 4,
    body: 'note',
    createdAt: 0,
    side: 'modified',
    ...overrides
  }
}

describe('diff comment compatibility helpers', () => {
  it('routes legacy comments with no source as diff comments', () => {
    const comment = makeComment()
    expect(getDiffCommentSource(comment)).toBe('diff')
    expect(isDiffComment(comment)).toBe(true)
    expect(isMarkdownComment(comment)).toBe(false)
  })

  it('routes markdown comments by explicit source', () => {
    const comment = makeComment({ source: 'markdown' })
    expect(getDiffCommentSource(comment)).toBe('markdown')
    expect(isMarkdownComment(comment)).toBe(true)
    expect(isDiffComment(comment)).toBe(false)
  })

  it('keeps a plain-file note out of the diff and markdown buckets but inside the editor one', () => {
    const comment = makeComment({ source: 'file', filePath: 'src/main.cpp' })
    expect(getDiffCommentSource(comment)).toBe('file')
    expect(isDiffComment(comment)).toBe(false)
    expect(isMarkdownComment(comment)).toBe(false)
    expect(isEditorComment(comment)).toBe(true)
  })

  it('counts markdown notes as editor notes and diff notes as not', () => {
    expect(isEditorComment(makeComment({ source: 'markdown' }))).toBe(true)
    expect(isEditorComment(makeComment({ source: 'diff' }))).toBe(false)
    expect(isEditorComment(makeComment())).toBe(false)
  })

  it('formats compact and full range labels', () => {
    const comment = makeComment({ startLine: 2, lineNumber: 4 })
    expect(getDiffCommentLineLabel(comment)).toBe('Lines 2-4')
    expect(getDiffCommentLineLabel(comment, true)).toBe('L2-L4')
  })
})
