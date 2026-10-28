import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { GeneralNote } from '../../../../shared/diff-comment-types'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { translate } from '@/i18n/i18n'
import {
  enqueueDiffCommentPersist,
  GENERAL_NOTES,
  mutateDiffComments,
  type PersistedReviewNoteKind
} from './diff-comment-persistence'
import {
  readDiffCommentsForChange,
  selectWorktreeGeneralNotesOrEmpty
} from '../worktree-diff-comments-selector'
import type { GeneralNoteDeliverySnapshot } from './diffComments'

type SliceSet = Parameters<StateCreator<AppState>>[0]

/** The store actions for general notes, review notes not tied to a file. */
export type GeneralNoteActions = {
  getGeneralNotes: (worktreeId: string | null | undefined) => readonly GeneralNote[]
  /** Resolves the saved note, or why it was not saved (e.g. the host predates general notes). */
  addGeneralNote: (
    worktreeId: string,
    body: string
  ) => Promise<{ note: GeneralNote } | { error: string }>
  updateGeneralNote: (worktreeId: string, noteId: string, body: string) => Promise<boolean>
  /** False when the deletion did not reach the host; the note is back in the list. */
  deleteGeneralNote: (worktreeId: string, noteId: string) => Promise<boolean>
}

// Why: best-effort telemetry runs only after the note is on disk, so a throw here must not report a failed save.
export function recordReviewNoteInteraction(get: () => AppState): void {
  try {
    get().recordFeatureInteraction?.('review-notes')
  } catch (err) {
    console.error('Failed to record review-notes interaction:', err)
  }
}

/**
 * Applies one change to a workspace's note list through the per-workspace save queue.
 * `unchanged` means `mutate` returned null (nothing to write).
 */
export async function commitReviewNotes<T>(
  set: SliceSet,
  get: () => AppState,
  worktreeId: string,
  kind: PersistedReviewNoteKind<T>,
  mutate: (existing: T[]) => T[] | null,
  noteIds?: Iterable<string>
): Promise<'unchanged' | 'saved' | { error: string }> {
  const result = mutateDiffComments(set, worktreeId, kind, mutate, noteIds)
  if (!result) {
    return 'unchanged'
  }
  try {
    await enqueueDiffCommentPersist(set, worktreeId, get, result)
    return 'saved'
  } catch (err) {
    console.error(`Failed to persist ${kind.field}:`, err)
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function clearDeliveredGeneralNotes(
  set: SliceSet,
  get: () => AppState,
  worktreeId: string,
  snapshots: readonly GeneralNoteDeliverySnapshot[]
): Promise<boolean> {
  if (snapshots.length === 0) {
    return true
  }
  const bodiesById = new Map(snapshots.map((note) => [note.id, note.body]))
  const outcome = await commitReviewNotes(
    set,
    get,
    worktreeId,
    GENERAL_NOTES,
    (existing) => {
      // Why: delivery is async; a note edited after its snapshot was sent is a fresh pending note.
      const next = existing.filter((note) => bodiesById.get(note.id) !== note.body)
      return next.length === existing.length ? null : next
    },
    bodiesById.keys()
  )
  if (outcome === 'saved') {
    recordReviewNoteInteraction(get)
  }
  return typeof outcome === 'string'
}

/** Builds the general-note actions over the same save queue as diff comments. */
export function createGeneralNoteActions(set: SliceSet, get: () => AppState): GeneralNoteActions {
  return {
    getGeneralNotes: (worktreeId) => selectWorktreeGeneralNotesOrEmpty(get(), worktreeId),

    addGeneralNote: async (worktreeId, body) => {
      const trimmed = body.trim()
      if (!trimmed) {
        return { error: translate('generalNotes.empty', 'The note is empty.') }
      }
      const note: GeneralNote = {
        id: createBrowserUuid(),
        worktreeId,
        body: trimmed,
        createdAt: Date.now()
      }
      const outcome = await commitReviewNotes(set, get, worktreeId, GENERAL_NOTES, (existing) => [
        ...existing,
        note
      ])
      if (outcome !== 'saved') {
        return typeof outcome === 'object'
          ? outcome
          : { error: translate('generalNotes.workspaceGone', 'The workspace is gone.') }
      }
      recordReviewNoteInteraction(get)
      return { note }
    },

    updateGeneralNote: async (worktreeId, noteId, body) => {
      const trimmed = body.trim()
      if (!trimmed) {
        return false
      }
      const existing = readDiffCommentsForChange(get(), worktreeId, [noteId], GENERAL_NOTES)
      if (!existing.some((note) => note.id === noteId)) {
        return false
      }
      const outcome = await commitReviewNotes(
        set,
        get,
        worktreeId,
        GENERAL_NOTES,
        (current) => {
          const idx = current.findIndex((note) => note.id === noteId)
          if (idx === -1 || current[idx].body === trimmed) {
            return null
          }
          const next = current.slice()
          next[idx] = { ...current[idx], body: trimmed, updatedAt: Date.now(), sentAt: undefined }
          return next
        },
        [noteId]
      )
      return typeof outcome === 'string'
    },

    deleteGeneralNote: async (worktreeId, noteId) => {
      const outcome = await commitReviewNotes(
        set,
        get,
        worktreeId,
        GENERAL_NOTES,
        (existing) => {
          const next = existing.filter((note) => note.id !== noteId)
          return next.length === existing.length ? null : next
        },
        [noteId]
      )
      return typeof outcome === 'string'
    }
  }
}
