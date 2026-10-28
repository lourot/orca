import React, { useCallback, useMemo } from 'react'
import {
  isGeneralNote,
  type DiffComment,
  type GeneralNote,
  type ReviewNote
} from '../../../../shared/diff-comment-types'
import { useAppStore } from '@/store'
import { formatDiffComments, formatReviewNotes } from '@/lib/diff-comments-format'
import { NotesSendMenu, type NotesSendMenuScope } from './NotesSendMenu'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'

// Expire unconsumed keyboard requests so navigating away cannot reopen the menu on a later mount.
const OPEN_REQUEST_TTL_MS = 5000
const NO_GENERAL_NOTES: readonly GeneralNote[] = Object.freeze([])

export function DiffNotesSendMenu({
  worktreeId,
  groupId,
  comments,
  generalNotes = NO_GENERAL_NOTES,
  filePath,
  showFileScope = false,
  triggerClassName,
  triggerLabel,
  triggerCount,
  actionLabel,
  iconClassName = 'size-3.5',
  align = 'end',
  respondToOpenRequest = false
}: {
  worktreeId: string
  groupId: string
  comments: readonly DiffComment[]
  // Why a prop: only a surface that lists general notes may send them, since delivery deletes them.
  generalNotes?: readonly GeneralNote[]
  filePath?: string
  showFileScope?: boolean
  triggerClassName?: string
  triggerLabel?: string
  triggerCount?: number
  actionLabel?: string
  iconClassName?: string
  align?: 'start' | 'center' | 'end'
  // Enable on exactly one instance per worktree to avoid opening multiple menus for one shortcut.
  respondToOpenRequest?: boolean
}): React.JSX.Element {
  const languageRevision = useUiLanguageRevision()
  const clearDeliveredDiffComments = useAppStore((s) => s.clearDeliveredDiffComments)
  const openRequest = useAppStore((s) => s.diffNotesSendMenuOpenRequest)
  const consumeOpenRequest = useAppStore((s) => s.consumeDiffNotesSendMenuOpenRequest)
  // Enforce TTL when opening commits in NotesSendMenu; render-time clocks are stale or require polling.
  const hasPendingOpenRequest = respondToOpenRequest && openRequest?.worktreeId === worktreeId
  const openRequestNonce = hasPendingOpenRequest ? (openRequest?.nonce ?? null) : null
  const openRequestExpiresAt = hasPendingOpenRequest
    ? (openRequest?.issuedAt ?? 0) + OPEN_REQUEST_TTL_MS
    : null
  const handleOpenRequestHandled = useCallback(
    () => consumeOpenRequest(worktreeId),
    [consumeOpenRequest, worktreeId]
  )
  const unsentNotes = useMemo<ReviewNote[]>(
    () => [...generalNotes, ...comments].filter((note) => !note.sentAt),
    [comments, generalNotes]
  )
  const fileNotes = useMemo(
    () => (filePath ? comments.filter((comment) => comment.filePath === filePath) : []),
    [comments, filePath]
  )
  const unsentFileNotes = useMemo(() => fileNotes.filter((comment) => !comment.sentAt), [fileNotes])
  const canSendFileScope = showFileScope && Boolean(filePath)
  const scopes = useMemo<NotesSendMenuScope<ReviewNote>[]>(() => {
    const allNotesScope: NotesSendMenuScope<ReviewNote> = {
      id: 'all',
      label: translate('auto.components.editor.DiffNotesSendMenu.8b87612461', 'All unsent notes'),
      notes: unsentNotes,
      formatPrompt: formatReviewNotes
    }
    if (!canSendFileScope) {
      return [allNotesScope]
    }
    return [
      {
        id: 'file',
        label: translate('auto.components.editor.DiffNotesSendMenu.f1aa04b5cf', 'This file'),
        notes: unsentFileNotes,
        formatPrompt: (notes: readonly ReviewNote[]) =>
          formatDiffComments(notes.filter((note): note is DiffComment => !isGeneralNote(note)))
      },
      allNotesScope
    ]
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- translate() reads the UI language implicitly.
  }, [canSendFileScope, unsentFileNotes, unsentNotes, languageRevision])

  return (
    <NotesSendMenu
      worktreeId={worktreeId}
      groupId={groupId}
      modeIdParts={['diff-notes', worktreeId, groupId, filePath ?? 'all']}
      scopes={scopes}
      // File menus must not broaden delivery before the user enters All unsent notes.
      defaultScopeId={canSendFileScope ? 'file' : 'all'}
      triggerClassName={triggerClassName}
      triggerLabel={triggerLabel}
      triggerCount={triggerCount}
      actionLabel={actionLabel}
      iconClassName={iconClassName}
      align={align}
      openRequestNonce={openRequestNonce}
      openRequestExpiresAt={openRequestExpiresAt}
      onOpenRequestHandled={handleOpenRequestHandled}
      onDelivered={(notes) => void clearDeliveredDiffComments(worktreeId, notes)}
    />
  )
}
