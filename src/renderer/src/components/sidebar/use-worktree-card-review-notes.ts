import { useCallback } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { isMarkdownComment } from '@/lib/diff-comment-compat'
import { isMarkdownReviewNotesEnabled } from '@/lib/markdown-review-notes-setting'
import { useAppStore } from '@/store'

/** Unsent review-note counts for a workspace card and the action that opens them. */
export function useWorktreeCardReviewNotes(
  worktree: Pick<Worktree, 'id' | 'diffComments' | 'generalNotes'>,
  settings: GlobalSettings | null | undefined,
  showComment: boolean
): {
  hoverUnsentReviewNoteCount: number
  metaUnsentReviewNoteCount: number
  handleOpenReviewNotes: () => void
} {
  // Why: same visibility rule as the Source Control notes shelf, so the badge never counts a note the shelf hides.
  const markdownReviewNotesEnabled = isMarkdownReviewNotesEnabled(settings)
  const hoverUnsentReviewNoteCount =
    (worktree.diffComments?.filter(
      (comment) => !comment.sentAt && (markdownReviewNotesEnabled || !isMarkdownComment(comment))
    ).length ?? 0) + (worktree.generalNotes?.filter((note) => !note.sentAt).length ?? 0)
  // Why: read the action at click time; a store subscription here would add a listener per card.
  const handleOpenReviewNotes = useCallback(
    () => useAppStore.getState().requestDiffNotesShelfReveal(worktree.id),
    [worktree.id]
  )
  return {
    hoverUnsentReviewNoteCount,
    // Why: review notes ride on the Notes property so no new card property crosses the client wire schema.
    metaUnsentReviewNoteCount: showComment ? hoverUnsentReviewNoteCount : 0,
    handleOpenReviewNotes
  }
}
