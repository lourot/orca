import { useEffect, useRef } from 'react'
import type { editor, IPosition, IRange } from 'monaco-editor'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { isMacUserAgent } from '@/components/terminal-pane/pane-helpers'
import type { MarkdownDocument } from '../../../../shared/filesystem-entry-types'
import {
  createMarkdownDocumentIndex,
  getMarkdownDocLinkTarget,
  resolveMarkdownDocLink
} from './markdown-doc-links'
import { getMarkdownDocLinkDecorationRanges } from './monaco-markdown-doc-link-decorations'

/**
 * The `[[target]]` under `position`, using the same ranges the source view decorates, so text in
 * code spans and fences never follows.
 */
export function getMarkdownDocLinkTargetAt(
  content: string,
  position: IPosition,
  lineContent: string
): string | null {
  const range = getMarkdownDocLinkRangeAt(content, position)
  return range
    ? getMarkdownDocLinkTarget(lineContent.slice(range.startColumn + 1, range.endColumn - 3))
    : null
}

function getMarkdownDocLinkRangeAt(content: string, position: IPosition): IRange | undefined {
  return getMarkdownDocLinkDecorationRanges(content).find(
    (candidate) =>
      candidate.startLineNumber === position.lineNumber &&
      position.column >= candidate.startColumn &&
      position.column < candidate.endColumn
  )
}

function isFollowModifier(event: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return isMacUserAgent() ? event.metaKey : event.ctrlKey
}

/**
 * Cmd-click (Ctrl-click off macOS) on a `[[wiki-link]]` in Markdown source opens its document;
 * holding the modifier over one shows it as a link.
 */
export function useMonacoDocLinkFollow(
  editorInstance: editor.IStandaloneCodeEditor | null,
  language: string,
  markdownDocuments: MarkdownDocument[] | undefined,
  onOpenDocLink: ((target: string) => void) | undefined
): void {
  const latest = useRef({ markdownDocuments, onOpenDocLink })
  useEffect(() => {
    latest.current = { markdownDocuments, onOpenDocLink }
  })

  useEffect(() => {
    if (!editorInstance || language !== 'markdown') {
      return
    }
    const followable = editorInstance.createDecorationsCollection()
    let hovered: IPosition | null = null
    const showFollowable = (modifierHeld: boolean): void => {
      const model = editorInstance.getModel()
      const range =
        modifierHeld && hovered && model && latest.current.onOpenDocLink
          ? getMarkdownDocLinkRangeAt(model.getValue(), hovered)
          : undefined
      if (!range && followable.length === 0) {
        return
      }
      followable.set(
        range ? [{ range, options: { inlineClassName: 'monaco-markdown-doc-link-follow' } }] : []
      )
    }
    const hoverListeners = [
      editorInstance.onMouseMove((event) => {
        hovered = event.target.position
        showFollowable(isFollowModifier(event.event))
      }),
      editorInstance.onMouseLeave(() => {
        hovered = null
        showFollowable(false)
      }),
      editorInstance.onKeyDown((event) => showFollowable(isFollowModifier(event))),
      editorInstance.onKeyUp((event) => showFollowable(isFollowModifier(event)))
    ]
    const listener = editorInstance.onMouseDown((event) => {
      const browserEvent = event.event
      const position = event.target.position
      const model = editorInstance.getModel()
      const { markdownDocuments: documents, onOpenDocLink: open } = latest.current
      if (!open || !documents || !position || !model) {
        return
      }
      if (!isFollowModifier(browserEvent)) {
        return
      }
      const target = getMarkdownDocLinkTargetAt(
        model.getValue(),
        position,
        model.getLineContent(position.lineNumber)
      )
      if (!target) {
        return
      }
      browserEvent.preventDefault()
      browserEvent.stopPropagation()
      const resolution = resolveMarkdownDocLink(target, createMarkdownDocumentIndex(documents))
      if (resolution.status === 'resolved') {
        open(target)
      } else {
        toast.error(
          resolution.status === 'missing'
            ? translate('editor.docLink.missing', 'No note named {{target}} in this workspace.', {
                target
              })
            : translate(
                'editor.docLink.ambiguous',
                'Several notes are named {{target}}; link one by its path.',
                { target }
              )
        )
      }
    })
    return () => {
      listener.dispose()
      hoverListeners.forEach((disposable) => disposable.dispose())
      followable.clear()
    }
  }, [editorInstance, language])
}
