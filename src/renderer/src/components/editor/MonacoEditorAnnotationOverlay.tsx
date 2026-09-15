import React, { type Dispatch, type SetStateAction } from 'react'
import { Plus } from 'lucide-react'
import { DiffCommentPopover } from '../diff-comments/DiffCommentPopover'
import { translate } from '@/i18n/i18n'
import type { MonacoSelectionAnnotationTarget } from './monaco-selection-annotation'
import type { EditorCommentPopoverState } from './use-monaco-editor-annotations'

type MonacoEditorAnnotationOverlayProps = {
  shouldShowEditorAnnotations: boolean
  commentPopover: EditorCommentPopoverState | null
  setCommentPopover: Dispatch<SetStateAction<EditorCommentPopoverState | null>>
  selectionAnnotationTarget: MonacoSelectionAnnotationTarget | null
  setSelectionAnnotationTarget: Dispatch<SetStateAction<MonacoSelectionAnnotationTarget | null>>
  onSubmitEditorComment: (body: string) => Promise<void>
}

export function MonacoEditorAnnotationOverlay({
  shouldShowEditorAnnotations,
  commentPopover,
  setCommentPopover,
  selectionAnnotationTarget,
  setSelectionAnnotationTarget,
  onSubmitEditorComment
}: MonacoEditorAnnotationOverlayProps): React.JSX.Element {
  return (
    <>
      {commentPopover && shouldShowEditorAnnotations && (
        <DiffCommentPopover
          key={commentPopover.lineNumber}
          lineNumber={commentPopover.lineNumber}
          startLine={commentPopover.startLine}
          top={commentPopover.top}
          left={commentPopover.left}
          onCancel={() => setCommentPopover(null)}
          onSubmit={onSubmitEditorComment}
        />
      )}
      {selectionAnnotationTarget && shouldShowEditorAnnotations && !commentPopover ? (
        <button
          type="button"
          className="orca-diff-comment-add-btn"
          style={{
            display: 'flex',
            top: Math.max(4, selectionAnnotationTarget.top - 22),
            left: selectionAnnotationTarget.left ?? 4
          }}
          title={translate(
            'auto.components.editor.MonacoEditor.68cb83f4a7',
            'Add note on selected text'
          )}
          aria-label={translate(
            'auto.components.editor.MonacoEditor.68cb83f4a7',
            'Add note on selected text'
          )}
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setCommentPopover(selectionAnnotationTarget)
            setSelectionAnnotationTarget(null)
          }}
        >
          <Plus className="size-3" />
        </button>
      ) : null}
    </>
  )
}
