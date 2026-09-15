import type { DiffComment, DiffCommentSource } from '../../../shared/diff-comment-types'

export function getDiffCommentSource(comment: Pick<DiffComment, 'source'>): DiffCommentSource {
  return comment.source === 'markdown' || comment.source === 'file' ? comment.source : 'diff'
}

export function isDiffComment(comment: Pick<DiffComment, 'source'>): boolean {
  return getDiffCommentSource(comment) === 'diff'
}

export function isMarkdownComment(comment: Pick<DiffComment, 'source'>): boolean {
  return getDiffCommentSource(comment) === 'markdown'
}

/** Authored in a text editor (any language) rather than on a diff. */
export function isEditorComment(comment: Pick<DiffComment, 'source'>): boolean {
  return getDiffCommentSource(comment) !== 'diff'
}

export function getDiffCommentLineLabel(
  comment: Pick<DiffComment, 'lineNumber' | 'startLine'>,
  compact = false
): string {
  if (comment.startLine !== undefined && comment.startLine !== comment.lineNumber) {
    return compact
      ? `L${comment.startLine}-L${comment.lineNumber}`
      : `Lines ${comment.startLine}-${comment.lineNumber}`
  }
  return compact ? `L${comment.lineNumber}` : `Line ${comment.lineNumber}`
}
