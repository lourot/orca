import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react'
import type { editor } from 'monaco-editor'
import type { DiffComment } from '../../../../shared/diff-comment-types'
import { useAppStore } from '@/store'
import { selectWorktreeDiffComments } from '@/store/worktree-diff-comments-selector'
import { isEditorComment } from '@/lib/diff-comment-compat'
import {
  captureReviewNoteExcerpt,
  formatMarkdownReviewNotes,
  type EditorReviewNote
} from '@/lib/markdown-review-notes'
import { useDiffCommentDecorator } from '../diff-comments/useDiffCommentDecorator'
import {
  getDiffCommentPopoverLeft,
  getDiffCommentPopoverTop
} from '../diff-comments/diff-comment-popover-position'
import {
  getMonacoSelectionAnnotationTarget,
  type MonacoSelectionAnnotationTarget
} from './monaco-selection-annotation'

export type EditorCommentPopoverState = Omit<MonacoSelectionAnnotationTarget, 'selectedText'> & {
  selectedText?: string
}

export type MonacoEditorAnnotations = {
  shouldShowEditorAnnotations: boolean
  shouldShowEditorAnnotationsRef: MutableRefObject<boolean>
  commentPopover: EditorCommentPopoverState | null
  setCommentPopover: Dispatch<SetStateAction<EditorCommentPopoverState | null>>
  commentPopoverRef: MutableRefObject<EditorCommentPopoverState | null>
  selectionAnnotationTarget: MonacoSelectionAnnotationTarget | null
  setSelectionAnnotationTarget: Dispatch<SetStateAction<MonacoSelectionAnnotationTarget | null>>
  handleSubmitEditorComment: (body: string) => Promise<void>
}

export function useMonacoEditorAnnotations(params: {
  mountedEditor: editor.IStandaloneCodeEditor | null
  editorContainerRef: MutableRefObject<HTMLDivElement | null>
  relativePath: string
  content: string
  language: string
  worktreeId: string | undefined
  annotationsEnabled: boolean
}): MonacoEditorAnnotations {
  const {
    mountedEditor,
    editorContainerRef,
    relativePath,
    content,
    language,
    worktreeId,
    annotationsEnabled
  } = params

  const addDiffComment = useAppStore((s) => s.addDiffComment)
  const deleteDiffComment = useAppStore((s) => s.deleteDiffComment)
  const updateDiffComment = useAppStore((s) => s.updateDiffComment)
  const scrollToDiffCommentId = useAppStore((s) => s.scrollToDiffCommentId)
  const setScrollToDiffCommentId = useAppStore((s) => s.setScrollToDiffCommentId)
  const allDiffComments = useAppStore((s): DiffComment[] | undefined =>
    selectWorktreeDiffComments(s, worktreeId)
  )

  const editorComments = useMemo(
    () => (allDiffComments ?? []).filter((c) => c.filePath === relativePath && isEditorComment(c)),
    [allDiffComments, relativePath]
  )

  const [commentPopover, setCommentPopover] = useState<EditorCommentPopoverState | null>(null)
  const [selectionAnnotationTarget, setSelectionAnnotationTarget] =
    useState<MonacoSelectionAnnotationTarget | null>(null)
  // Why: claim drafts synchronously so a same-tick second chord can't remount the composer before React commits state.
  const commentPopoverRef = useRef<EditorCommentPopoverState | null>(null)
  useEffect(() => {
    commentPopoverRef.current = commentPopover
  }, [commentPopover])

  // Why: notes decorate the Monaco model, not rendered markdown, so every text
  // language works. Callers gate out surfaces with no useful text model.
  const shouldShowEditorAnnotations = annotationsEnabled && Boolean(worktreeId)
  // Why: the mount closure installs keydown listeners once, so the shortcut reads current enablement through a ref.
  const shouldShowEditorAnnotationsRef = useRef(shouldShowEditorAnnotations)
  useEffect(() => {
    shouldShowEditorAnnotationsRef.current = shouldShowEditorAnnotations
  }, [shouldShowEditorAnnotations])

  const pendingScrollForThisEditor = useMemo(() => {
    if (!shouldShowEditorAnnotations || !scrollToDiffCommentId) {
      return null
    }
    return editorComments.some((c) => c.id === scrollToDiffCommentId) ? scrollToDiffCommentId : null
  }, [editorComments, scrollToDiffCommentId, shouldShowEditorAnnotations])
  const formatEditorCommentPrompt = useCallback(
    (comment: DiffComment) => formatMarkdownReviewNotes([comment as EditorReviewNote], content),
    [content]
  )

  useDiffCommentDecorator({
    editor: shouldShowEditorAnnotations ? mountedEditor : null,
    filePath: relativePath,
    worktreeId: worktreeId ?? '',
    comments: shouldShowEditorAnnotations ? editorComments : [],
    onAddCommentClick: ({ lineNumber, startLine, top }) => {
      setSelectionAnnotationTarget(null)
      setCommentPopover({
        lineNumber,
        startLine,
        top,
        left: mountedEditor
          ? (getDiffCommentPopoverLeft(mountedEditor, editorContainerRef.current) ?? undefined)
          : undefined
      })
    },
    onDeleteComment: (id) => {
      if (worktreeId) {
        void deleteDiffComment(worktreeId, id)
      }
    },
    onUpdateComment: worktreeId ? (id, body) => updateDiffComment(worktreeId, id, body) : undefined,
    formatCommentPrompt: formatEditorCommentPrompt,
    pendingScrollCommentId: pendingScrollForThisEditor,
    onPendingScrollConsumed: () => setScrollToDiffCommentId(null)
  })

  useEffect(() => {
    if (!mountedEditor || !commentPopover) {
      return
    }
    const update = (): void => {
      const top = getDiffCommentPopoverTop(mountedEditor, commentPopover.lineNumber, undefined)
      const left = getDiffCommentPopoverLeft(mountedEditor, editorContainerRef.current)
      setCommentPopover((prev) =>
        prev ? { ...prev, top: top ?? prev.top, left: left == null ? prev.left : left } : prev
      )
    }
    const scrollSub = mountedEditor.onDidScrollChange(update)
    const contentSub = mountedEditor.onDidContentSizeChange(update)
    const layoutSub = mountedEditor.onDidLayoutChange(update)
    return () => {
      scrollSub.dispose()
      contentSub.dispose()
      layoutSub.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- match DiffViewer: don't resubscribe on top updates.
  }, [mountedEditor, commentPopover?.lineNumber])

  useEffect(() => {
    if (!mountedEditor || !shouldShowEditorAnnotations || commentPopover) {
      setSelectionAnnotationTarget(null)
      return
    }
    const update = (): void => {
      const left = getDiffCommentPopoverLeft(mountedEditor, editorContainerRef.current)
      setSelectionAnnotationTarget(
        getMonacoSelectionAnnotationTarget(
          mountedEditor,
          mountedEditor.getSelection(),
          left ?? undefined
        )
      )
    }
    update()
    const selectionSub = mountedEditor.onDidChangeCursorSelection(update)
    const scrollSub = mountedEditor.onDidScrollChange(update)
    const layoutSub = mountedEditor.onDidLayoutChange(update)
    return () => {
      selectionSub.dispose()
      scrollSub.dispose()
      layoutSub.dispose()
    }
  }, [commentPopover, editorContainerRef, mountedEditor, shouldShowEditorAnnotations])

  const handleSubmitEditorComment = async (body: string): Promise<void> => {
    if (!commentPopover || !worktreeId) {
      return
    }
    const result = await addDiffComment({
      worktreeId,
      filePath: relativePath,
      // Why: the rendered-markdown surfaces only handle 'markdown', so a .cpp
      // note must not claim to be one.
      source: language === 'markdown' ? 'markdown' : 'file',
      startLine: commentPopover.startLine,
      lineNumber: commentPopover.lineNumber,
      selectedText: commentPopover.selectedText,
      anchorExcerpt: captureReviewNoteExcerpt(content, commentPopover),
      body,
      side: 'modified'
    })
    if (result) {
      setCommentPopover(null)
    } else {
      console.error('Failed to add editor comment — draft preserved')
    }
  }

  return {
    shouldShowEditorAnnotations,
    shouldShowEditorAnnotationsRef,
    commentPopover,
    setCommentPopover,
    commentPopoverRef,
    selectionAnnotationTarget,
    setSelectionAnnotationTarget,
    handleSubmitEditorComment
  }
}
