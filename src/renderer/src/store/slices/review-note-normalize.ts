import type { DiffComment, GeneralNote } from '../../../../shared/diff-comment-types'
import { parseDiffComparison } from '../../../../shared/diff-comparison'

export function normalizeDiffComment(comment: DiffComment): DiffComment {
  const rawSource = (comment as { source?: unknown }).source
  const source =
    rawSource === 'markdown' || rawSource === 'diff' || rawSource === 'file' ? rawSource : undefined
  const reviewedComparison = parseDiffComparison(
    (comment as { reviewedComparison?: unknown }).reviewedComparison
  )
  const rawStartLine = (comment as { startLine?: unknown }).startLine
  const startLine =
    Number.isInteger(rawStartLine) &&
    typeof rawStartLine === 'number' &&
    rawStartLine >= 1 &&
    rawStartLine <= comment.lineNumber
      ? rawStartLine
      : undefined
  const rawSelectedText = (comment as { selectedText?: unknown }).selectedText
  const selectedText =
    typeof rawSelectedText === 'string' && rawSelectedText.trim().length > 0
      ? rawSelectedText.trim()
      : undefined
  const rawAnchorExcerpt = (comment as { anchorExcerpt?: unknown }).anchorExcerpt
  const anchorExcerpt =
    typeof rawAnchorExcerpt === 'string' && rawAnchorExcerpt.length > 0
      ? rawAnchorExcerpt
      : undefined
  const rawSentAt = (comment as { sentAt?: unknown }).sentAt
  const sentAt =
    typeof rawSentAt === 'number' && Number.isFinite(rawSentAt) && rawSentAt > 0
      ? rawSentAt
      : undefined

  return {
    ...comment,
    ...(source !== undefined ? { source } : {}),
    ...(source === undefined ? { source: undefined } : {}),
    ...(selectedText !== undefined ? { selectedText } : {}),
    ...(selectedText === undefined ? { selectedText: undefined } : {}),
    ...(startLine !== undefined ? { startLine } : {}),
    ...(startLine === undefined ? { startLine: undefined } : {}),
    ...(anchorExcerpt !== undefined ? { anchorExcerpt } : { anchorExcerpt: undefined }),
    ...(sentAt !== undefined ? { sentAt } : {}),
    ...(sentAt === undefined ? { sentAt: undefined } : {}),
    ...(reviewedComparison !== undefined
      ? { reviewedComparison }
      : { reviewedComparison: undefined })
  }
}

export function normalizeGeneralNote(note: GeneralNote): GeneralNote {
  const sentAt =
    typeof note.sentAt === 'number' && Number.isFinite(note.sentAt) && note.sentAt > 0
      ? note.sentAt
      : undefined
  return { ...note, sentAt }
}
