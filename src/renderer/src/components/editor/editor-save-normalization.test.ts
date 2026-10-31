// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import type { StoreApi } from 'zustand'
import type { AppState } from '@/store'
import { editorModelRegistry } from '@/lib/editor-model-registry'
import { requestEditorFileSave } from './editor-autosave'
import { attachEditorAutosaveController } from './editor-autosave-controller'
import { createEditorStore } from './editor-autosave-controller-test-fixture'
import { editorTabModelUri } from './editor-save-disk-precondition'
import { openGuardedFile, stubGuardedDisk } from './editor-save-guarded-disk-fixture'
import { __clearSelfWriteRegistryForTests } from './editor-self-write-registry'
import { normalizeSavedText, normalizeTextForSave } from './editor-save-normalization'

const storeRef = vi.hoisted((): { current: StoreApi<AppState> | null } => ({ current: null }))

vi.mock('@/lib/connection-context', () => ({ getConnectionIdForFile: () => null }))
vi.mock('@/store', () => ({ useAppStore: { getState: () => storeRef.current?.getState() } }))
vi.mock('@/lib/file-owner-runtime-target', () => ({
  getRuntimeTargetForFileOwner: () => ({ kind: 'local' })
}))

describe('normalizeTextForSave', () => {
  it('ends text with one line break and trims trailing whitespace unless told not to', () => {
    const cases: Record<string, [string, boolean]> = {
      addsLf: ['a\nb', true],
      keepsCrlf: ['a\r\nb', true],
      collapsesTrailingNewlines: ['a\n\n\n', true],
      trimsLineEnds: ['a  \nb\t\n', true],
      dropsWhitespaceOnlyTail: ['a\n  \n\t\n', true],
      emptyStaysEmpty: ['', true],
      blankBecomesEmpty: [' \n\n', true],
      keepsMarkdownLineBreak: ['a  \nb', false]
    }
    expect(
      Object.fromEntries(
        Object.entries(cases).map(([name, [text, trim]]) => [
          name,
          normalizeTextForSave(text, trim)
        ])
      )
    ).toEqual({
      addsLf: 'a\nb\n',
      keepsCrlf: 'a\r\nb\r\n',
      collapsesTrailingNewlines: 'a\n',
      trimsLineEnds: 'a\nb\n',
      dropsWhitespaceOnlyTail: 'a\n',
      emptyStaysEmpty: '',
      blankBecomesEmpty: '',
      keepsMarkdownLineBreak: 'a  \nb\n'
    })
  })
})

function openFile(path: string, draft: string, disk: string) {
  const store = createEditorStore()
  storeRef.current = store
  store.setState({
    settings: { ...store.getState().settings!, editorAutoSave: false, editorNormalizeOnSave: true }
  })
  const fileId = openGuardedFile(store, { filePath: path, baseline: disk, draft })
  return { store, fileId }
}

/** Stubs the window last: Monaco editors must be created against the real DOM window. */
async function save(store: StoreApi<AppState>, fileId: string, path: string, disk: string) {
  const { files } = stubGuardedDisk({ [path]: disk })
  const cleanup = attachEditorAutosaveController(store)
  try {
    await requestEditorFileSave({ fileId })
  } finally {
    cleanup()
  }
  return files.get(path)
}

/** Only text metrics are needed; these tests do not inspect canvas painting. */
function createEditor(model: monaco.editor.ITextModel): {
  dispose: () => void
  editor: monaco.editor.IStandaloneCodeEditor
} {
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: editor construction reads only these canvas members.
    .mockReturnValue({
      webkitBackingStorePixelRatio: 1,
      measureText: (value: string) => ({ width: value.length * 8 })
    } as never)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = monaco.editor.create(host, { model })
  return {
    editor,
    dispose: () => {
      editor.dispose()
      host.remove()
      getContext.mockRestore()
    }
  }
}

describe('normalizing on save', () => {
  let unregister: () => void = () => {}

  beforeEach(() => {
    unregister = editorModelRegistry.register(monaco)
  })

  afterEach(() => {
    unregister()
    for (const model of monaco.editor.getModels()) {
      model.dispose()
    }
    __clearSelfWriteRegistryForTests()
    vi.unstubAllGlobals()
    storeRef.current = null
  })

  it.each([
    ['writes YAML normalized', '/repo/a.yaml', 'k: v  \n\n\n', 'k: v\n'],
    ['keeps CRLF files on CRLF', '/repo/a.yaml', 'k: v\r\nl: w', 'k: v\r\nl: w\r\n'],
    [
      'keeps a Markdown line break',
      '/repo/a.md',
      'line one  \nline two\n\n',
      'line one  \nline two\n'
    ]
  ])('%s', async (_label, path, draft, written) => {
    const { store, fileId } = openFile(path, draft, 'old\n')

    expect(await save(store, fileId, path, 'old\n')).toBe(written)
    expect(store.getState().openFiles[0]?.isDirty).toBe(false)
  })

  it('edits the open model as one undo step and leaves the cursor in place', async () => {
    const path = '/repo/a.ts'
    const draft = 'const a = 1  \nconst b = 2'
    const { store, fileId } = openFile(path, draft, 'old\n')
    const file = store.getState().openFiles[0]!
    const model = monaco.editor.createModel(
      draft,
      'typescript',
      monaco.Uri.parse(editorTabModelUri(store.getState(), file))
    )
    const { editor, dispose } = createEditor(model)
    editor.setPosition({ lineNumber: 2, column: 5 })
    try {
      expect(await save(store, fileId, path, 'old\n')).toBe('const a = 1\nconst b = 2\n')
      expect(model.getValue()).toBe('const a = 1\nconst b = 2\n')
      expect(editor.getPosition()?.toJSON()).toEqual({ lineNumber: 2, column: 5 })
      model.undo()
      expect(model.getValue()).toBe(draft)
    } finally {
      dispose()
    }
  })

  it('keeps the whitespace being typed on the cursor line when autosaving', () => {
    const draft = 'a  \nb  '
    const { store } = openFile('/repo/a.ts', draft, 'old\n')
    const file = store.getState().openFiles[0]!
    const model = monaco.editor.createModel(
      draft,
      'typescript',
      monaco.Uri.parse(editorTabModelUri(store.getState(), file))
    )
    const { editor, dispose } = createEditor(model)
    editor.setPosition({ lineNumber: 2, column: 4 })
    try {
      expect({
        autosave: normalizeSavedText(store.getState(), file, draft, 'autosave'),
        cursor: editor.getPosition()?.toJSON()
      }).toEqual({ autosave: 'a\nb  \n', cursor: { lineNumber: 2, column: 4 } })
    } finally {
      dispose()
    }
  })
})
