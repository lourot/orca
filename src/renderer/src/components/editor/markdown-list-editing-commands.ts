import type * as Monaco from 'monaco-editor'
import { createMarkdownFenceTracker } from './markdown-fence-scanner'
import { markdownEnterEdit, markdownListIndentEdit } from './markdown-list-editing'

type CodeEditor = Monaco.editor.ICodeEditor
type MonacoApi = Pick<typeof Monaco, 'editor' | 'KeyCode' | 'KeyMod' | 'Range' | 'Selection'>

// Why global commands, not editor.addCommand: Monaco shares keybindings across editors, so a
// per-editor command would fire in whichever editor registered last.
const WHEN =
  'editorTextFocus && editorLangId == markdown && !editorReadonly && !suggestWidgetVisible && ' +
  '!inlineSuggestionVisible && !inSnippetMode && !editorHasMultipleSelections'

function isInFencedCode(model: Monaco.editor.ITextModel, lineNumber: number): boolean {
  const tracker = createMarkdownFenceTracker()
  for (let line = 1; line < lineNumber; line += 1) {
    tracker.consume(model.getLineContent(line))
  }
  // A fence delimiter line counts as code too.
  return tracker.insideFence || tracker.consume(model.getLineContent(lineNumber))
}

function indentUnitOf(model: Monaco.editor.ITextModel): string {
  const { insertSpaces, indentSize } = model.getOptions()
  return insertSpaces ? ' '.repeat(indentSize) : '\t'
}

function replaceLine(
  monaco: MonacoApi,
  editorInstance: CodeEditor,
  model: Monaco.editor.ITextModel,
  edit: { lineNumber: number; text: string; cursor: { lineNumber: number; column: number } }
): void {
  const { lineNumber, text, cursor } = edit
  editorInstance.pushUndoStop()
  editorInstance.executeEdits(
    'markdown-list-editing',
    [
      {
        range: new monaco.Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)),
        text
      }
    ],
    [new monaco.Selection(cursor.lineNumber, cursor.column, cursor.lineNumber, cursor.column)]
  )
  // executeEdits never scrolls, unlike Monaco's own typing.
  editorInstance.revealPosition(cursor)
  editorInstance.pushUndoStop()
}

/** Applies Enter's list or quote edit; false leaves the key to Monaco. */
export function handleMarkdownEnter(monaco: MonacoApi, editorInstance: CodeEditor): boolean {
  const model = editorInstance.getModel()
  const selection = editorInstance.getSelection()
  if (!model || !selection?.isEmpty() || isInFencedCode(model, selection.startLineNumber)) {
    return false
  }
  const { startLineNumber: lineNumber, startColumn: column } = selection
  const edit = markdownEnterEdit(model.getLineContent(lineNumber), column, indentUnitOf(model))
  if (!edit) {
    return false
  }
  const text =
    edit.nextLine === undefined ? edit.line : `${edit.line}${model.getEOL()}${edit.nextLine}`
  const cursorLine = edit.nextLine === undefined ? lineNumber : lineNumber + 1
  replaceLine(monaco, editorInstance, model, {
    lineNumber,
    text,
    cursor: { lineNumber: cursorLine, column: edit.cursorColumn }
  })
  return true
}

/** Applies Tab/Shift-Tab to a list item; false leaves the key to Monaco. */
export function handleMarkdownIndent(
  monaco: MonacoApi,
  editorInstance: CodeEditor,
  direction: 'indent' | 'outdent'
): boolean {
  const model = editorInstance.getModel()
  const selection = editorInstance.getSelection()
  // Multi-line selections keep Monaco's block indent.
  if (!model || !selection || selection.startLineNumber !== selection.endLineNumber) {
    return false
  }
  const lineNumber = selection.startLineNumber
  if (isInFencedCode(model, lineNumber)) {
    return false
  }
  const edit = markdownListIndentEdit(
    model.getLineContent(lineNumber),
    direction,
    indentUnitOf(model)
  )
  if (!edit) {
    return false
  }
  replaceLine(monaco, editorInstance, model, {
    lineNumber,
    text: edit.line,
    cursor: { lineNumber, column: Math.max(1, selection.positionColumn + edit.columnShift) }
  })
  return true
}

let installation: Monaco.IDisposable[] = []

/**
 * In Markdown source, Enter continues list items and quotes and Tab/Shift-Tab move list items
 * a level; anywhere else (other lines, code fences) the keys keep Monaco's own behavior.
 */
export function installMarkdownListEditing(monaco: MonacoApi): void {
  installation.forEach((disposable) => disposable.dispose())
  const { KeyCode, KeyMod } = monaco
  const bindings: [string, number, (editorInstance: CodeEditor) => void][] = [
    [
      'orca.markdownList.enter',
      KeyCode.Enter,
      (editorInstance) =>
        handleMarkdownEnter(monaco, editorInstance) ||
        editorInstance.trigger('keyboard', 'type', { text: '\n' })
    ],
    [
      'orca.markdownList.indent',
      KeyCode.Tab,
      (editorInstance) =>
        handleMarkdownIndent(monaco, editorInstance, 'indent') ||
        editorInstance.trigger('keyboard', 'tab', null)
    ],
    [
      'orca.markdownList.outdent',
      KeyMod.Shift | KeyCode.Tab,
      (editorInstance) =>
        handleMarkdownIndent(monaco, editorInstance, 'outdent') ||
        editorInstance.trigger('keyboard', 'outdent', null)
    ]
  ]
  installation = [
    ...bindings.map(([id, , run]) =>
      monaco.editor.registerCommand(id, () => {
        const focused = monaco.editor.getEditors().find((candidate) => candidate.hasTextFocus())
        if (focused) {
          run(focused)
        }
      })
    ),
    monaco.editor.addKeybindingRules(
      bindings.map(([id, keybinding]) => ({ keybinding, command: id, when: WHEN }))
    )
  ]
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => installation.forEach((disposable) => disposable.dispose()))
}
