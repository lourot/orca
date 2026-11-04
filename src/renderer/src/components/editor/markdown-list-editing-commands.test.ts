// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import { handleMarkdownEnter, handleMarkdownIndent } from './markdown-list-editing-commands'

const disposers: (() => void)[] = []

/** A real Monaco editor on a Markdown model; only text metrics are mocked. */
function markdownEditor(text: string, lineNumber: number, column: number) {
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: editor construction reads only these canvas members.
    .mockReturnValue({
      webkitBackingStorePixelRatio: 1,
      measureText: (value: string) => ({ width: value.length * 8 })
    } as never)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const model = monaco.editor.createModel(text, 'markdown')
  model.updateOptions({ insertSpaces: true, indentSize: 2, tabSize: 2 })
  const editor = monaco.editor.create(host, { model })
  editor.setPosition({ lineNumber, column })
  disposers.push(() => {
    editor.dispose()
    model.dispose()
    host.remove()
    getContext.mockRestore()
  })
  return { editor, model }
}

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose())
})

describe('Markdown list editing in Monaco', () => {
  it('continues an item on Enter as one undoable edit, cursor after the new marker', () => {
    const { editor, model } = markdownEditor('- [x] milk', 1, 11)
    expect(handleMarkdownEnter(monaco, editor)).toBe(true)
    expect(model.getValue()).toBe('- [x] milk\n- [ ] ')
    expect(editor.getPosition()?.toJSON()).toEqual({ lineNumber: 2, column: 7 })
    model.undo()
    expect(model.getValue()).toBe('- [x] milk')
  })

  it('leaves Enter to Monaco inside a code fence', () => {
    const { editor, model } = markdownEditor('```\n- not a list\n```', 2, 13)
    expect(handleMarkdownEnter(monaco, editor)).toBe(false)
    expect(model.getValue()).toBe('```\n- not a list\n```')
  })

  it('indents a list item with Tab using the model indentation', () => {
    const { editor, model } = markdownEditor('- a\n- b', 2, 4)
    expect(handleMarkdownIndent(monaco, editor, 'indent')).toBe(true)
    expect(model.getValue()).toBe('- a\n  - b')
    expect(editor.getPosition()?.toJSON()).toEqual({ lineNumber: 2, column: 6 })
  })
})
