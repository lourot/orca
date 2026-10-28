import React, { useCallback, useState } from 'react'
import { Check, Copy, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { DiffCommentDraftCard } from '@/components/diff-comments/DiffCommentDraftCard'
import { translate } from '@/i18n/i18n'
import { formatReviewNote } from '@/lib/diff-comments-format'
import { useAppStore } from '@/store'
import { selectWorktreeGeneralNotesOrEmpty } from '@/store/worktree-diff-comments-selector'
import type { GeneralNote } from '../../../../../../shared/diff-comment-types'
import { useCopyFeedbackState } from './copy-feedback'

/**
 * A workspace's general notes (review notes not tied to a file): an optional composer, then one
 * row per note that copies, deletes, or opens an inline editor on click.
 */
export function GeneralNotesSection({
  worktreeId,
  composerOpen,
  onComposerClose,
  showEmptyHint = false
}: {
  worktreeId: string
  composerOpen: boolean
  onComposerClose: () => void
  showEmptyHint?: boolean
}): React.JSX.Element | null {
  const notes = useAppStore((s) => selectWorktreeGeneralNotesOrEmpty(s, worktreeId))
  const addGeneralNote = useAppStore((s) => s.addGeneralNote)
  const updateGeneralNote = useAppStore((s) => s.updateGeneralNote)
  const deleteGeneralNote = useAppStore((s) => s.deleteGeneralNote)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [copiedId, showCopiedId] = useCopyFeedbackState<string | null>(null)

  const handleAdd = useCallback(
    async (body: string): Promise<boolean> => {
      const added = await addGeneralNote(worktreeId, body)
      if ('error' in added) {
        toast.error(translate('generalNotes.saveFailed', 'Failed to save note'), {
          description: added.error
        })
        return false
      }
      onComposerClose()
      return true
    },
    [addGeneralNote, onComposerClose, worktreeId]
  )

  const handleCopy = useCallback(
    async (note: GeneralNote): Promise<void> => {
      try {
        await window.api.ui.writeClipboardText(formatReviewNote(note))
        showCopiedId(note.id)
      } catch {
        // Why: swallow — clipboard write can fail when the window isn't focused.
      }
    },
    [showCopiedId]
  )

  if (notes.length === 0 && !composerOpen && !showEmptyHint) {
    return null
  }

  return (
    <div className="px-3 py-1.5">
      <div className="text-[10px] font-medium text-muted-foreground">
        {translate('generalNotes.groupLabel', 'General')}
      </div>
      {composerOpen ? (
        <div className="mt-1">
          <DiffCommentDraftCard onCancel={onComposerClose} onSubmit={handleAdd} />
        </div>
      ) : null}
      {notes.length === 0 && !composerOpen ? (
        <div className="mt-1 text-[11px] text-muted-foreground">
          {translate(
            'generalNotes.emptyHint',
            'Notes here are not tied to a file. They go out with Send notes.'
          )}
        </div>
      ) : null}
      <ul className="mt-1 space-y-1">
        {notes.map((note) =>
          editingId === note.id ? (
            <li key={note.id}>
              <DiffCommentDraftCard
                initialBody={note.body}
                submitLabel={translate('generalNotes.save', 'Save')}
                submittingLabel={translate('generalNotes.saving', 'Saving...')}
                onCancel={() => setEditingId(null)}
                onSubmit={async (body) => {
                  const saved = await updateGeneralNote(worktreeId, note.id, body)
                  if (saved) {
                    setEditingId(null)
                  } else {
                    toast.error(translate('generalNotes.saveFailed', 'Failed to save note'))
                  }
                  return saved
                }}
              />
            </li>
          ) : (
            <li
              key={note.id}
              className="group flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-accent/40"
            >
              <button
                type="button"
                // Why: single inner target keeps copy/delete as siblings, not nested interactive elements.
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded text-left"
                onClick={() => setEditingId(note.id)}
                title={translate('generalNotes.edit', 'Edit note')}
              >
                {note.sentAt ? (
                  <span className="shrink-0 rounded bg-muted/70 px-1 py-0.5 text-[10px] leading-none text-muted-foreground">
                    {translate('auto.components.right.sidebar.SourceControl.655633c08a', 'Sent')}
                  </span>
                ) : null}
                <span className="block min-w-0 flex-1 whitespace-pre-wrap break-words text-[11px] leading-snug text-foreground">
                  {note.body}
                </span>
              </button>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground can-hover:opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                onClick={() => void handleCopy(note)}
                title={translate(
                  'auto.components.right.sidebar.SourceControl.1623bf4e19',
                  'Copy note'
                )}
                aria-label={translate(
                  'auto.components.right.sidebar.SourceControl.1623bf4e19',
                  'Copy note'
                )}
              >
                {copiedId === note.id ? <Check className="size-3" /> : <Copy className="size-3" />}
              </button>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground can-hover:opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                onClick={() =>
                  void deleteGeneralNote(worktreeId, note.id).then((deleted) => {
                    if (!deleted) {
                      toast.error(translate('generalNotes.deleteFailed', 'Failed to delete note'))
                    }
                  })
                }
                title={translate(
                  'auto.components.right.sidebar.SourceControl.b656381c18',
                  'Delete note'
                )}
                aria-label={translate(
                  'auto.components.right.sidebar.SourceControl.b656381c18',
                  'Delete note'
                )}
              >
                <Trash className="size-3" />
              </button>
            </li>
          )
        )}
      </ul>
    </div>
  )
}
