import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { captureReviewNoteExcerpt } from '@/lib/markdown-review-notes'
import type { DiffComparison } from '../../../../shared/diff-comparison'

type ReviewNoteTarget = {
  lineNumber: number
  startLine?: number
}

type AddDiffComment = (args: {
  worktreeId: string
  filePath: string
  source: 'diff'
  startLine?: number
  lineNumber: number
  body: string
  anchorExcerpt?: string
  reviewedComparison?: DiffComparison
  side: 'modified'
}) => Promise<unknown>

/**
 * Shared submit path for both diff surfaces: the single-file viewer and each
 * combined-diff section. `onAddLineComment` diverts to a review provider
 * (GitHub/GitLab PRs), which owns its own persistence.
 */
export async function submitReviewNote({
  addDiffComment,
  body,
  filePath,
  modifiedContent,
  onAddLineComment,
  target,
  reviewedComparison,
  worktreeId
}: {
  addDiffComment: AddDiffComment
  body: string
  filePath: string
  modifiedContent: string
  onAddLineComment?: (args: {
    lineNumber: number
    startLine?: number
    body: string
  }) => Promise<boolean>
  target: ReviewNoteTarget
  reviewedComparison?: DiffComparison
  worktreeId?: string
}): Promise<boolean> {
  if (onAddLineComment) {
    return onAddLineComment({
      lineNumber: target.lineNumber,
      startLine: target.startLine,
      body
    })
  }
  if (!worktreeId) {
    return false
  }
  // Close only after persistence succeeds; rollback must leave the draft available for retry.
  const result = await addDiffComment({
    worktreeId,
    filePath,
    source: 'diff',
    startLine: target.startLine,
    lineNumber: target.lineNumber,
    anchorExcerpt: captureReviewNoteExcerpt(modifiedContent, target),
    body,
    reviewedComparison,
    side: 'modified'
  })
  if (!result) {
    toast.error(translate('auto.components.editor.diffCommentSaveFailed', 'Failed to save comment'))
  }
  return Boolean(result)
}
