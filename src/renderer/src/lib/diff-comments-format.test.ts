import { describe, it, expect } from 'vitest'
import type { DiffComment } from '../../../shared/diff-comment-types'
import type { DiffComparison } from '../../../shared/diff-comparison'
import {
  DIFF_COMMENTS_LINE_NUMBER_NOTE,
  formatDiffComment,
  formatDiffComments
} from './diff-comments-format'

const BRANCH_COMPARISON: DiffComparison = {
  kind: 'branch',
  baseRef: 'origin/main',
  compareRef: 'HEAD',
  mergeBase: 'eb046c19aaaa',
  headOid: '2d96f303bbbb'
}

function makeComment(overrides: Partial<DiffComment> = {}): DiffComment {
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

describe('formatDiffComment', () => {
  it('emits the fixed three-line structure', () => {
    const out = formatDiffComment(makeComment())
    expect(out).toBe(
      ['File: src/app.ts', 'Line: 10', 'User comment: "Needs validation"'].join('\n')
    )
  })

  it('keeps explicit diff comments without ranges in the legacy format', () => {
    const out = formatDiffComment(makeComment({ source: 'diff' }))
    expect(out).toBe(
      ['File: src/app.ts', 'Line: 10', 'User comment: "Needs validation"'].join('\n')
    )
  })

  it('formats persisted ranges when startLine is present', () => {
    const out = formatDiffComment(makeComment({ source: 'diff', startLine: 7 }))
    expect(out).toBe(
      ['File: src/app.ts', 'Lines: 7-10', 'User comment: "Needs validation"'].join('\n')
    )
  })

  it('formats file-level diff notes', () => {
    const out = formatDiffComment(makeComment({ source: 'diff', lineNumber: 0 }))
    expect(out).toBe(
      ['File: src/app.ts', 'Scope: file', 'User comment: "Needs validation"'].join('\n')
    )
  })

  it('adds markdown source metadata for markdown notes', () => {
    const out = formatDiffComment(makeComment({ source: 'markdown', startLine: 8 }))
    expect(out).toBe(
      [
        'File: src/app.ts',
        'Source: markdown',
        'Lines: 8-10',
        'User comment: "Needs validation"'
      ].join('\n')
    )
  })

  it('labels a file note as its own source, never as markdown', () => {
    const out = formatDiffComment(makeComment({ source: 'file' }))
    expect(out).toBe(
      ['File: src/app.ts', 'Source: file', 'Line: 10', 'User comment: "Needs validation"'].join(
        '\n'
      )
    )
  })

  it('names the reviewed comparison, symbolically and as a runnable oid pair', () => {
    const cases: [DiffComparison, string][] = [
      [BRANCH_COMPARISON, 'Range: origin/main...HEAD (eb046c19..2d96f303)'],
      [
        {
          kind: 'branch',
          baseRef: '',
          compareRef: '',
          mergeBase: 'eb046c19aaaa',
          headOid: '2d96f303bbbb'
        },
        'Range: eb046c19...2d96f303 (eb046c19..2d96f303)'
      ],
      [
        { kind: 'commit', commitOid: '9f81a2c0dddd', parentOid: '1a2b3c4eeeee' },
        'Range: commit 9f81a2c0 (1a2b3c4e..9f81a2c0)'
      ],
      [{ kind: 'commit', commitOid: '9f81a2c0dddd' }, 'Range: commit 9f81a2c0 (root commit)'],
      [
        { kind: 'uncommitted', compares: 'worktree-vs-head' },
        'Range: working tree vs HEAD (uncommitted)'
      ],
      [
        { kind: 'uncommitted', compares: 'worktree-vs-index' },
        'Range: working tree vs index (unstaged)'
      ],
      [{ kind: 'uncommitted', compares: 'index-vs-head' }, 'Range: index vs HEAD (staged)']
    ]
    expect(
      cases.map(
        ([reviewedComparison]) =>
          formatDiffComment(makeComment({ reviewedComparison })).split('\n')[1]
      )
    ).toEqual(cases.map(([, expected]) => expected))
  })

  // Why: a batched prompt has no file content to derive an excerpt from, so a
  // note stored without one reaches the agent as a bare line number.
  it('quotes the excerpt captured at creation', () => {
    const out = formatDiffComment(
      makeComment({ source: 'file', anchorExcerpt: '>   resolution: {integrity: sha512-x}' })
    )
    expect(out).toBe(
      [
        'File: src/app.ts',
        'Source: file',
        'Line: 10',
        'Excerpt:',
        '>   resolution: {integrity: sha512-x}',
        'User comment: "Needs validation"'
      ].join('\n')
    )
  })

  it('escapes embedded quotes in the body', () => {
    const out = formatDiffComment(makeComment({ body: 'why "this" path?' }))
    expect(out).toContain('User comment: "why \\"this\\" path?"')
  })

  it('escapes backslashes before quotes so the body cannot break out of the literal', () => {
    const out = formatDiffComment(makeComment({ body: 'path\\to\\"thing"' }))
    expect(out).toContain('User comment: "path\\\\to\\\\\\"thing\\""')
  })

  it('escapes newlines so the body cannot break out of the fixed 3-line structure', () => {
    const out = formatDiffComment(makeComment({ body: 'first\nsecond' }))
    expect(out).toContain('User comment: "first\\nsecond"')
    expect(out.split('\n')).toHaveLength(3)
  })
})

describe('formatDiffComments', () => {
  it('joins multiple comments with a blank line', () => {
    const out = formatDiffComments([
      makeComment({ id: 'a', lineNumber: 1, body: 'first' }),
      makeComment({ id: 'b', lineNumber: 2, body: 'second' })
    ])
    expect(out).toBe(
      [
        'File: src/app.ts',
        'Line: 1',
        'User comment: "first"',
        '',
        'File: src/app.ts',
        'Line: 2',
        'User comment: "second"'
      ].join('\n')
    )
  })

  it('returns an empty string for an empty input', () => {
    expect(formatDiffComments([])).toBe('')
  })

  it('emits the line-number note exactly once for a mixed legacy + ranged list', () => {
    const out = formatDiffComments([
      makeComment({ id: 'a', lineNumber: 1, body: 'legacy' }),
      makeComment({ id: 'b', lineNumber: 2, body: 'ranged', reviewedComparison: BRANCH_COMPARISON })
    ])
    expect(out.split(DIFF_COMMENTS_LINE_NUMBER_NOTE)).toHaveLength(2)
    expect(out).toBe(
      [
        DIFF_COMMENTS_LINE_NUMBER_NOTE,
        '',
        'File: src/app.ts',
        'Line: 1',
        'User comment: "legacy"',
        '',
        'File: src/app.ts',
        'Range: origin/main...HEAD (eb046c19..2d96f303)',
        'Line: 2',
        'User comment: "ranged"'
      ].join('\n')
    )
  })

  it('leaves a legacy-only prompt byte-identical', () => {
    expect(formatDiffComments([makeComment()])).toBe(
      ['File: src/app.ts', 'Line: 10', 'User comment: "Needs validation"'].join('\n')
    )
  })
})
