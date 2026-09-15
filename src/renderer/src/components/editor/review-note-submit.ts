import { captureReviewNoteExcerpt } from '@/lib/markdown-review-notes'
import type { DiffComparison } from '../../../../shared/diff-comparison'

type ReviewNotePopoverTarget = {
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
  popover,
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
  popover: ReviewNotePopoverTarget
  reviewedComparison?: DiffComparison
  worktreeId?: string
}): Promise<boolean> {
  if (onAddLineComment) {
    return onAddLineComment({
      lineNumber: popover.lineNumber,
      startLine: popover.startLine,
      body
    })
  }
  if (!worktreeId) {
    return false
  }
  // Why: await persistence before closing the popover. If the store rolls back
  // the optimistic insert, keep the user's draft open so they can retry.
  const result = await addDiffComment({
    worktreeId,
    filePath,
    source: 'diff',
    startLine: popover.startLine,
    lineNumber: popover.lineNumber,
    anchorExcerpt: captureReviewNoteExcerpt(modifiedContent, popover),
    body,
    reviewedComparison,
    side: 'modified'
  })
  if (!result) {
    console.error('Failed to add diff comment - draft preserved')
  }
  return Boolean(result)
}
