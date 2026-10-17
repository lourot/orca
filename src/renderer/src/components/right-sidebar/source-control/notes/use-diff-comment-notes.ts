import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { formatReviewNotes } from '@/lib/diff-comments-format'
import { describeClipboardWriteFailure } from '@/lib/clipboard-write-failure'
import { useAppStore } from '@/store'
import type { DiffCommentsClearOptions } from '@/store/slices/diffComments'
import { selectWorktreeGeneralNotesOrEmpty } from '@/store/worktree-diff-comments-selector'
import { useVisibleWorktreeDiffComments } from '../../../diff-comments/use-visible-worktree-diff-comments'
import {
  countPendingDiffCommentsClear,
  formatPendingDiffCommentsClearDescription,
  resolvePendingDiffCommentsClear,
  type PendingDiffCommentsClear
} from './diff-comments-clear-dialog-state'
import { useCopyFeedbackState } from './copy-feedback'

const SHELF_REVEAL_REQUEST_TTL_MS = 5000

export function useSourceControlDiffCommentNotes({
  activeWorktreeId,
  clearDiffComments,
  clearDiffCommentsForFile
}: {
  activeWorktreeId: string | null
  clearDiffComments: (worktreeId: string, options?: DiffCommentsClearOptions) => Promise<boolean>
  clearDiffCommentsForFile: (
    worktreeId: string,
    filePath: string,
    options?: DiffCommentsClearOptions
  ) => Promise<boolean>
}) {
  const { comments: diffCommentsForActive, markdownReviewNotesEnabled } =
    useVisibleWorktreeDiffComments(activeWorktreeId)
  const diffCommentCount = diffCommentsForActive.length
  const generalNotesForActive = useAppStore((s) =>
    selectWorktreeGeneralNotesOrEmpty(s, activeWorktreeId)
  )
  const noteCount = diffCommentCount + generalNotesForActive.length
  const [generalNoteComposerOpen, setGeneralNoteComposerOpen] = useState(false)
  // Index counts once so each row need not refilter every comment.
  const diffCommentCountByPath = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of diffCommentsForActive) {
      map.set(c.filePath, (map.get(c.filePath) ?? 0) + 1)
    }
    return map
  }, [diffCommentsForActive])
  const diffCommentsPrompt = useMemo(
    () => formatReviewNotes([...generalNotesForActive, ...diffCommentsForActive]),
    [diffCommentsForActive, generalNotesForActive]
  )
  const [diffCommentsExpanded, setDiffCommentsExpanded] = useState(false)
  const shelfRevealRequest = useAppStore((s) => s.diffNotesShelfRevealRequest)
  const consumeShelfRevealRequest = useAppStore((s) => s.consumeDiffNotesShelfRevealRequest)
  useEffect(() => {
    if (!activeWorktreeId || shelfRevealRequest?.worktreeId !== activeWorktreeId) {
      return
    }
    if (Date.now() - shelfRevealRequest.issuedAt <= SHELF_REVEAL_REQUEST_TTL_MS) {
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- Why: a one-shot store request with a wall-clock TTL that must be consumed (a store write), so it cannot run during render.
      setDiffCommentsExpanded(true)
    }
    consumeShelfRevealRequest(activeWorktreeId)
  }, [activeWorktreeId, consumeShelfRevealRequest, shelfRevealRequest])
  const [diffCommentsCopied, showDiffCommentsCopied] = useCopyFeedbackState(false)
  const [pendingDiffCommentsClear, setPendingDiffCommentsClear] =
    useState<PendingDiffCommentsClear | null>(null)
  const [isClearingDiffComments, setIsClearingDiffComments] = useState(false)
  // Reset during render so workspace switches cannot paint the old confirmation.
  const [notesWorktreeId, setNotesWorktreeId] = useState(activeWorktreeId)
  if (notesWorktreeId !== activeWorktreeId) {
    setNotesWorktreeId(activeWorktreeId)
    setPendingDiffCommentsClear(null)
    setIsClearingDiffComments(false)
    setGeneralNoteComposerOpen(false)
  }
  const openGeneralNoteComposer = useCallback(() => {
    setDiffCommentsExpanded(true)
    setGeneralNoteComposerOpen(true)
  }, [])
  const closeGeneralNoteComposer = useCallback(() => setGeneralNoteComposerOpen(false), [])
  const handleCopyDiffComments = useCallback(async (): Promise<void> => {
    if (noteCount === 0) {
      return
    }
    try {
      await window.api.ui.writeClipboardText(diffCommentsPrompt)
      showDiffCommentsCopied(true)
    } catch (error) {
      // Report rejected writes (sender/size guards) so failed copies cannot look successful until paste.
      toast.error(
        translate(
          'auto.components.right.sidebar.SourceControl.diffCommentNotesCopyFailed',
          'Failed to copy notes'
        ),
        { description: describeClipboardWriteFailure(error) }
      )
    }
  }, [noteCount, diffCommentsPrompt, showDiffCommentsCopied])

  const pendingDiffCommentsClearCount = useMemo(() => {
    const fileNoteCount = countPendingDiffCommentsClear(
      pendingDiffCommentsClear,
      activeWorktreeId,
      diffCommentsForActive
    )
    // Why: "Clear all notes" in this shelf also clears the general notes it lists.
    const generalNoteCount =
      pendingDiffCommentsClear?.kind === 'all' &&
      pendingDiffCommentsClear.worktreeId === activeWorktreeId
        ? generalNotesForActive.length
        : 0
    return fileNoteCount + generalNoteCount
  }, [activeWorktreeId, diffCommentsForActive, generalNotesForActive, pendingDiffCommentsClear])

  const resolvedPendingDiffCommentsClear = resolvePendingDiffCommentsClear({
    activeWorktreeId,
    isClearing: isClearingDiffComments,
    pending: pendingDiffCommentsClear,
    pendingCount: pendingDiffCommentsClearCount
  })
  if (resolvedPendingDiffCommentsClear !== pendingDiffCommentsClear) {
    // Clear impossible local confirmations before children see a stale dialog.
    setPendingDiffCommentsClear(resolvedPendingDiffCommentsClear)
  }

  const pendingDiffCommentsClearDescription = formatPendingDiffCommentsClearDescription(
    resolvedPendingDiffCommentsClear,
    pendingDiffCommentsClearCount
  )

  const handleConfirmDiffCommentsClear = useCallback(async (): Promise<void> => {
    const pending = resolvedPendingDiffCommentsClear
    if (!pending || isClearingDiffComments || pending.worktreeId !== activeWorktreeId) {
      return
    }
    if (pendingDiffCommentsClearCount === 0) {
      setPendingDiffCommentsClear(null)
      return
    }
    setIsClearingDiffComments(true)
    const clearOptions = { keepMarkdownNotes: !markdownReviewNotesEnabled }
    try {
      const ok =
        pending.kind === 'all'
          ? await clearDiffComments(pending.worktreeId, {
              ...clearOptions,
              includeGeneralNotes: true
            })
          : await clearDiffCommentsForFile(pending.worktreeId, pending.filePath, clearOptions)
      if (ok) {
        setPendingDiffCommentsClear(null)
      } else {
        toast.error(
          translate(
            'auto.components.right.sidebar.SourceControl.eae7a1da5f',
            'Failed to clear notes.'
          )
        )
      }
    } finally {
      setIsClearingDiffComments(false)
    }
  }, [
    activeWorktreeId,
    clearDiffComments,
    clearDiffCommentsForFile,
    isClearingDiffComments,
    markdownReviewNotesEnabled,
    resolvedPendingDiffCommentsClear,
    pendingDiffCommentsClearCount
  ])

  return {
    closeGeneralNoteComposer,
    generalNoteComposerOpen,
    generalNotesForActive,
    noteCount,
    openGeneralNoteComposer,
    diffCommentCount,
    diffCommentCountByPath,
    diffCommentsCopied,
    diffCommentsExpanded,
    diffCommentsForActive,
    handleConfirmDiffCommentsClear,
    handleCopyDiffComments,
    isClearingDiffComments,
    pendingDiffCommentsClearCount,
    pendingDiffCommentsClearDescription,
    resolvedPendingDiffCommentsClear,
    setDiffCommentsExpanded,
    setPendingDiffCommentsClear
  }
}

export type SourceControlDiffCommentNotes = ReturnType<typeof useSourceControlDiffCommentNotes>
