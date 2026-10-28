import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { DiffComment, GeneralNote } from '../../../../shared/diff-comment-types'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { isMarkdownComment } from '@/lib/diff-comment-compat'
import {
  DIFF_COMMENT_NOTES,
  enqueueDiffCommentPersist,
  GENERAL_NOTES,
  mutateDiffComments
} from './diff-comment-persistence'
import { normalizeDiffComment } from './review-note-normalize'
import {
  readDiffCommentsForChange,
  selectWorktreeDiffCommentsOrEmpty
} from '../worktree-diff-comments-selector'
import {
  clearDeliveredGeneralNotes,
  commitReviewNotes,
  createGeneralNoteActions,
  recordReviewNoteInteraction,
  type GeneralNoteActions
} from './general-note-actions'

export type DiffCommentsSlice = GeneralNoteActions & {
  getDiffComments: (worktreeId: string | null | undefined) => DiffComment[]
  addDiffComment: (input: Omit<DiffComment, 'id' | 'createdAt'>) => Promise<DiffComment | null>
  updateDiffComment: (worktreeId: string, commentId: string, body: string) => Promise<boolean>
  /** Removes delivered notes of both kinds; a note edited since its snapshot stays pending. */
  clearDeliveredDiffComments: (
    worktreeId: string,
    notes: readonly ReviewNoteDeliverySnapshot[]
  ) => Promise<boolean>
  markDiffCommentsSent: (
    worktreeId: string,
    commentIds: readonly string[],
    sentAt?: number
  ) => Promise<boolean>
  deleteDiffComment: (worktreeId: string, commentId: string) => Promise<void>
  clearDiffComments: (worktreeId: string, options?: DiffCommentsClearOptions) => Promise<boolean>
  clearDiffCommentsForFile: (
    worktreeId: string,
    filePath: string,
    options?: DiffCommentsClearOptions
  ) => Promise<boolean>
}

export type DiffCommentsClearOptions = {
  // Why: markdown notes hidden by the Markdown Review Notes setting must survive a clear the user can't see them in.
  keepMarkdownNotes?: boolean
  // Why opt-in: only a surface that lists general notes may clear them along with its own.
  includeGeneralNotes?: boolean
}

export type DiffCommentDeliverySnapshot = Pick<
  DiffComment,
  'body' | 'filePath' | 'id' | 'lineNumber' | 'selectedText' | 'source' | 'startLine'
>
export type GeneralNoteDeliverySnapshot = Pick<GeneralNote, 'body' | 'id' | 'filePath'>
export type ReviewNoteDeliverySnapshot = DiffCommentDeliverySnapshot | GeneralNoteDeliverySnapshot

/** Same test as the shared `isGeneralNote`, for the delivery snapshots the send menu holds. */
export function isGeneralNoteSnapshot(
  note: ReviewNoteDeliverySnapshot
): note is GeneralNoteDeliverySnapshot {
  return note.filePath === undefined
}

function generateId(): string {
  return createBrowserUuid()
}

function deliverySnapshotMatches(
  comment: DiffComment,
  snapshot: DiffCommentDeliverySnapshot
): boolean {
  return (
    comment.id === snapshot.id &&
    comment.body === snapshot.body &&
    comment.filePath === snapshot.filePath &&
    comment.lineNumber === snapshot.lineNumber &&
    comment.startLine === snapshot.startLine &&
    comment.selectedText === snapshot.selectedText &&
    comment.source === snapshot.source
  )
}

export const createDiffCommentsSlice: StateCreator<AppState, [], [], DiffCommentsSlice> = (
  set,
  get
) => ({
  // Why the shared selector: rendered surfaces and actions must read the same twin's notes.
  getDiffComments: (worktreeId) => selectWorktreeDiffCommentsOrEmpty(get(), worktreeId),

  ...createGeneralNoteActions(set, get),

  addDiffComment: async (input) => {
    const comment: DiffComment = normalizeDiffComment({
      ...input,
      id: generateId(),
      createdAt: Date.now()
    })
    const result = mutateDiffComments(set, input.worktreeId, DIFF_COMMENT_NOTES, (existing) => [
      ...existing,
      comment
    ])
    if (!result) {
      return null
    }
    try {
      // Why: serialize through the per-worktree queue so concurrent writes can't land on disk out of call order.
      await enqueueDiffCommentPersist(set, input.worktreeId, get, result)
    } catch (err) {
      console.error('Failed to persist diff comments:', err)
      return null
    }
    recordReviewNoteInteraction(get)
    return comment
  },

  updateDiffComment: async (worktreeId, commentId, body) => {
    // Why: reject an empty edit so we never save a note that renders as a blank card; false means "not committed", keep the editor open.
    const trimmed = body.trim()
    if (!trimmed) {
      return false
    }

    // Missing notes return false to keep draft; unchanged body returns true to close editor without mutation.
    const existing = readDiffCommentsForChange(get(), worktreeId, [commentId], DIFF_COMMENT_NOTES)
    const existingIdx = existing.findIndex((c) => c.id === commentId)
    if (existingIdx === -1) {
      return false
    }
    if (existing[existingIdx].body === trimmed) {
      return true
    }

    const result = mutateDiffComments(
      set,
      worktreeId,
      DIFF_COMMENT_NOTES,
      (current) => {
        const idx = current.findIndex((c) => c.id === commentId)
        if (idx === -1) {
          return null
        }
        if (current[idx].body === trimmed) {
          return null
        }
        const next = current.slice()
        // Why: editing a sent note makes the agent's copy stale, so reset sentAt to re-queue it for the next Send.
        next[idx] = { ...current[idx], body: trimmed, sentAt: undefined }
        return next
      },
      [commentId]
    )
    if (!result) {
      // Why: comment vanished or the same body was already written between pre-check and set; treat as success so the editor closes.
      return true
    }
    try {
      await enqueueDiffCommentPersist(set, worktreeId, get, result)
      return true
    } catch (err) {
      console.error('Failed to persist diff comments:', err)
      return false
    }
  },

  clearDeliveredDiffComments: async (worktreeId, notes) => {
    const generalCleared = clearDeliveredGeneralNotes(
      set,
      get,
      worktreeId,
      notes.filter(isGeneralNoteSnapshot)
    )
    const comments = notes.filter(
      (note): note is DiffCommentDeliverySnapshot => !isGeneralNoteSnapshot(note)
    )
    if (comments.length === 0) {
      return generalCleared
    }
    const snapshotsById = new Map(comments.map((comment) => [comment.id, comment]))
    const result = mutateDiffComments(
      set,
      worktreeId,
      DIFF_COMMENT_NOTES,
      (existing) => {
        const next = existing.filter((comment) => {
          const snapshot = snapshotsById.get(comment.id)
          // Why: delivery is async; a note edited after its snapshot was sent is a fresh pending note that must stay visible.
          return !snapshot || !deliverySnapshotMatches(comment, snapshot)
        })
        return next.length === existing.length ? null : next
      },
      snapshotsById.keys()
    )
    if (!result) {
      return generalCleared
    }
    try {
      await enqueueDiffCommentPersist(set, worktreeId, get, result)
    } catch (err) {
      console.error('Failed to persist diff comments:', err)
      return false
    }
    recordReviewNoteInteraction(get)
    return generalCleared
  },

  markDiffCommentsSent: async (worktreeId, commentIds, sentAt = Date.now()) => {
    if (commentIds.length === 0) {
      return true
    }
    const ids = new Set(commentIds)
    const result = mutateDiffComments(
      set,
      worktreeId,
      DIFF_COMMENT_NOTES,
      (existing) => {
        let changed = false
        const next = existing.map((comment) => {
          if (!ids.has(comment.id) || comment.sentAt === sentAt) {
            return comment
          }
          changed = true
          return { ...comment, sentAt }
        })
        return changed ? next : null
      },
      ids
    )
    if (!result) {
      return true
    }
    try {
      await enqueueDiffCommentPersist(set, worktreeId, get, result)
    } catch (err) {
      console.error('Failed to persist diff comments:', err)
      return false
    }
    recordReviewNoteInteraction(get)
    return true
  },

  deleteDiffComment: async (worktreeId, commentId) => {
    const result = mutateDiffComments(
      set,
      worktreeId,
      DIFF_COMMENT_NOTES,
      (existing) => {
        const next = existing.filter((c) => c.id !== commentId)
        return next.length === existing.length ? null : next
      },
      [commentId]
    )
    if (!result) {
      return
    }
    try {
      // Why: serialize through the per-worktree queue so concurrent writes can't land out of call order.
      await enqueueDiffCommentPersist(set, worktreeId, get, result)
    } catch (err) {
      console.error('Failed to persist diff comments:', err)
    }
  },

  clearDiffComments: async (worktreeId, options) => {
    const generalCleared = options?.includeGeneralNotes
      ? commitReviewNotes(set, get, worktreeId, GENERAL_NOTES, (existing) =>
          existing.length === 0 ? null : []
        )
      : Promise.resolve('unchanged' as const)
    const result = mutateDiffComments(set, worktreeId, DIFF_COMMENT_NOTES, (existing) => {
      const next = options?.keepMarkdownNotes ? existing.filter(isMarkdownComment) : []
      return next.length === existing.length ? null : next
    })
    if (!result) {
      return typeof (await generalCleared) === 'string'
    }
    try {
      await enqueueDiffCommentPersist(set, worktreeId, get, result)
      return typeof (await generalCleared) === 'string'
    } catch (err) {
      console.error('Failed to persist diff comments:', err)
      return false
    }
  },

  clearDiffCommentsForFile: async (worktreeId, filePath, options) => {
    const result = mutateDiffComments(set, worktreeId, DIFF_COMMENT_NOTES, (existing) => {
      const next = existing.filter(
        (c) =>
          c.filePath !== filePath || (options?.keepMarkdownNotes === true && isMarkdownComment(c))
      )
      return next.length === existing.length ? null : next
    })
    if (!result) {
      return true
    }
    try {
      await enqueueDiffCommentPersist(set, worktreeId, get, result)
      return true
    } catch (err) {
      console.error('Failed to persist diff comments:', err)
      return false
    }
  }
})
