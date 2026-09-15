import type { DiffComment } from './diff-comment-types'
import { formatDiffComparisonRange } from './diff-comparison'

/** Emitted once per prompt, and only when some note carries a reviewed comparison. */
export const DIFF_COMMENTS_LINE_NUMBER_NOTE =
  'Note: line numbers refer to the post-change side of each diff.'

// Keep the pasted review-note contract deterministic and quote-safe across clients/agents.
export function formatDiffComment(c: DiffComment): string {
  const escaped = c.body
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
  const locationLabel =
    c.lineNumber === 0
      ? 'Scope: file'
      : c.startLine !== undefined && c.startLine !== c.lineNumber
        ? `Lines: ${c.startLine}-${c.lineNumber}`
        : `Line: ${c.lineNumber}`
  const lines = [`File: ${c.filePath}`]
  if (c.source === 'markdown' || c.source === 'file') {
    lines.push(`Source: ${c.source}`)
  }
  if (c.reviewedComparison) {
    lines.push(`Range: ${formatDiffComparisonRange(c.reviewedComparison)}`)
  }
  lines.push(locationLabel)
  if (c.anchorExcerpt) {
    lines.push(`Excerpt:\n${c.anchorExcerpt}`)
  }
  lines.push(`User comment: "${escaped}"`)
  return lines.join('\n')
}

export function formatDiffComments(comments: readonly DiffComment[]): string {
  const body = comments.map(formatDiffComment).join('\n\n')
  // Why: legacy and mobile notes carry no comparison; keep their prompt byte-identical.
  return comments.some((c) => c.reviewedComparison)
    ? `${DIFF_COMMENTS_LINE_NUMBER_NOTE}\n\n${body}`
    : body
}
