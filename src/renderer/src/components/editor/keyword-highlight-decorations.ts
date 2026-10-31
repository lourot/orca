import type * as Monaco from 'monaco-editor'
import { findKeywordHighlights, type KeywordHighlightKind } from './keyword-highlight-matcher'

const REFRESH_DELAY_MS = 120
// Whole-model scans per edit; past this size the badges are not worth the cost.
const MAX_SCANNED_LENGTH = 1_000_000
const KEYWORD_COLOR = '#ffcc00'

const INLINE_CLASS: Record<KeywordHighlightKind, string> = {
  keyword: 'orca-keyword-highlight',
  comment: 'orca-keyword-comment-highlight',
  'la-identifier': 'orca-la-identifier-highlight'
}

function fileNameOf(model: Monaco.editor.ITextModel): string {
  const path = model.uri.path
  return path.slice(path.lastIndexOf('/') + 1)
}

function attachKeywordHighlights(
  monaco: typeof Monaco,
  editorInstance: Monaco.editor.ICodeEditor
): void {
  const collection = editorInstance.createDecorationsCollection()
  let timer: ReturnType<typeof setTimeout> | null = null

  const refreshNow = (): void => {
    timer = null
    const model = editorInstance.getModel()
    if (!model || model.getValueLength() > MAX_SCANNED_LENGTH) {
      collection.clear()
      return
    }
    collection.set(
      findKeywordHighlights(fileNameOf(model), model.getLinesContent()).map((highlight) => ({
        range: {
          startLineNumber: highlight.lineNumber,
          startColumn: highlight.startColumn,
          endLineNumber: highlight.lineNumber,
          endColumn: highlight.endColumn
        },
        options: {
          inlineClassName: INLINE_CLASS[highlight.kind],
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          ...(highlight.kind === 'keyword'
            ? {
                overviewRuler: {
                  color: KEYWORD_COLOR,
                  position: monaco.editor.OverviewRulerLane.Right
                }
              }
            : {})
        }
      }))
    )
  }
  const refreshSoon = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
    }
    timer = setTimeout(refreshNow, REFRESH_DELAY_MS)
  }

  const listeners = [
    editorInstance.onDidChangeModelContent(refreshSoon),
    editorInstance.onDidChangeModel(refreshNow)
  ]
  editorInstance.onDidDispose(() => {
    if (timer !== null) {
      clearTimeout(timer)
    }
    listeners.forEach((listener) => listener.dispose())
  })
  refreshNow()
}

let installation: Monaco.IDisposable | null = null

/** Badges TODO-style comments and `LA_` identifiers in every Monaco editor, diffs included. */
export function installKeywordHighlights(monaco: typeof Monaco): void {
  // Why: a hot reload re-runs Monaco setup; a second listener would stack the decorations.
  installation?.dispose()
  installation = monaco.editor.onDidCreateEditor((editorInstance) =>
    attachKeywordHighlights(monaco, editorInstance)
  )
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => installation?.dispose())
}
