import type * as Monaco from 'monaco-editor'
import type { AppState } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { detectLanguage } from '@/lib/language-detect'
import { editorModelRegistry, type EditorModelRegistryBridge } from '@/lib/editor-model-registry'
import {
  editorTabModelUri,
  isCodeViewTab,
  type EditorSaveTrigger
} from './editor-save-disk-precondition'

const TRAILING_WHITESPACE = /[ \t]+$/

/**
 * Saved text ends with exactly one line break and, unless `trimTrailingWhitespace` is false,
 * no line ends in spaces or tabs. Empty or blank text saves empty. Line breaks are not converted.
 */
export function normalizeTextForSave(text: string, trimTrailingWhitespace: boolean): string {
  const trimmed = trimTrailingWhitespace ? text.replace(/[ \t]+(?=\r?\n|$)/g, '') : text
  const body = trimmed.replace(/(?:\r?\n)+$/, '')
  return body === '' ? '' : `${body}${text.includes('\r\n') ? '\r\n' : '\n'}`
}

/** Markdown keeps trailing spaces: two of them are a line break. */
function trimsTrailingWhitespace(file: OpenFile): boolean {
  return detectLanguage(file.filePath) !== 'markdown'
}

/**
 * The edits that normalize `model` in place. Lines in `keepLines` keep their trailing
 * whitespace and stop the trailing-newline trim, so autosave never eats what the user is typing.
 */
function normalizationEdits(
  model: Monaco.editor.ITextModel,
  trimTrailingWhitespace: boolean,
  keepLines: ReadonlySet<number>,
  eol: string
): Monaco.editor.IIdentifiedSingleEditOperation[] {
  const trimmedLength = (line: number): number => {
    const text = model.getLineContent(line)
    return trimTrailingWhitespace && !keepLines.has(line)
      ? text.replace(TRAILING_WHITESPACE, '').length
      : text.length
  }
  const lineCount = model.getLineCount()
  let last = lineCount
  while (last > 0 && trimmedLength(last) === 0 && !keepLines.has(last)) {
    last -= 1
  }
  if (last === 0) {
    return model.getValueLength() === 0 ? [] : [{ range: model.getFullModelRange(), text: '' }]
  }
  const edits: Monaco.editor.IIdentifiedSingleEditOperation[] = []
  for (let line = 1; line < last; line += 1) {
    const length = trimmedLength(line)
    const fullLength = model.getLineLength(line)
    if (length < fullLength) {
      edits.push({
        range: {
          startLineNumber: line,
          startColumn: length + 1,
          endLineNumber: line,
          endColumn: fullLength + 1
        },
        text: ''
      })
    }
  }
  // One edit covers the last content line's trailing whitespace and everything after it.
  const tail = {
    startLineNumber: last,
    startColumn: trimmedLength(last) + 1,
    endLineNumber: lineCount,
    endColumn: model.getLineMaxColumn(lineCount)
  }
  if (model.getValueInRange(tail) !== eol) {
    edits.push({ range: tail, text: eol })
  }
  return edits
}

/**
 * Returns the text to save, normalized as `normalizeTextForSave` describes. A code view's open
 * model gets the same change as one undoable edit, with cursors left where they were.
 */
export function normalizeSavedText(
  state: AppState,
  file: OpenFile,
  content: string,
  trigger: EditorSaveTrigger | undefined,
  bridge: EditorModelRegistryBridge = editorModelRegistry
): string {
  // Why code views only: rich Markdown, notebook and CSV views serialize their own text.
  // Why not 'convert' or 'restart': those write the existing text back, not an edit.
  const normalizes = trigger === 'user' || trigger === 'autosave' || trigger === 'overwrite'
  if (
    state.settings?.editorNormalizeOnSave !== true ||
    !normalizes ||
    !isCodeViewTab(state, file)
  ) {
    return content
  }
  const trimWhitespace = trimsTrailingWhitespace(file)
  const registry = bridge.get()
  const model = registry?.editor.getModel(registry.Uri.parse(editorTabModelUri(state, file)))
  const modelMatchesContent = Boolean(model && !model.isDisposed() && model.getValue() === content)
  if (!registry || !model || !modelMatchesContent) {
    const next = normalizeTextForSave(content, trimWhitespace)
    if ((!model || model.isDisposed()) && next !== content) {
      state.setEditorDraft(file.id, next)
    }
    return next
  }
  const editors = registry.editor.getEditors().filter((editor) => editor.getModel() === model)
  const selections = editors.map((editor) => editor.getSelections())
  const keepLines = new Set(
    trigger === 'autosave'
      ? selections.flatMap((ranges) => (ranges ?? []).map((range) => range.positionLineNumber))
      : []
  )
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const edits = normalizationEdits(model, trimWhitespace, keepLines, eol)
  if (edits.length === 0) {
    return content
  }
  model.pushStackElement()
  model.pushEOL(
    eol === '\r\n' ? registry.editor.EndOfLineSequence.CRLF : registry.editor.EndOfLineSequence.LF
  )
  model.pushEditOperations([], edits, () => null)
  model.pushStackElement()
  // Why: a cursor in removed whitespace would otherwise jump; Monaco clamps restored positions.
  editors.forEach((editor, index) => {
    const selection = selections[index]
    if (selection) {
      editor.setSelections(selection)
    }
  })
  const next = model.getValue()
  state.setEditorDraft(file.id, next)
  return next
}
