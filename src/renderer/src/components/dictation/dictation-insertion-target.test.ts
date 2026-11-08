// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getUtf8ByteLength } from '../../../../shared/utf8-byte-limits'

import {
  TEXT_CONTROL_PASTE_CHUNK_MAX_BYTES,
  TEXT_CONTROL_PASTE_DIRECT_MAX_BYTES,
  TEXT_CONTROL_PASTE_MAX_BYTES
} from '@/lib/text-control-paste'
import { insertText } from './dictation-insertion-target'

type DocumentWithExecCommand = Document & {
  execCommand?: (commandId: string, showUi?: boolean, value?: string) => boolean
}

const originalExecCommand = (document as DocumentWithExecCommand).execCommand
const writeClipboardText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  writeClipboardText.mockReset().mockResolvedValue(undefined)
  Object.assign(window, { api: { ui: { writeClipboardText } } })
})

afterEach(() => {
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.restoreAllMocks()
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: originalExecCommand
  })
})

function appendTextarea(): HTMLTextAreaElement {
  const textarea = document.createElement('textarea')
  document.body.appendChild(textarea)
  textarea.focus()
  return textarea
}

function appendContentEditable(): HTMLElement {
  const element = document.createElement('div')
  element.contentEditable = 'true'
  element.tabIndex = 0
  document.body.appendChild(element)
  element.focus()
  return element
}

function installExecCommandMock(
  implementation: (commandId: string, showUi?: boolean, value?: string) => boolean
): ReturnType<typeof vi.fn> {
  const execCommand = vi.fn(implementation)
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: execCommand
  })
  return execCommand
}

describe('dictation insertion target', () => {
  it('dispatches terminal dictation with the captured pane target', () => {
    const listener = vi.fn((event: Event) => event.preventDefault())
    document.addEventListener('dictation:insertText', listener)

    insertText('git status', { kind: 'terminal', tabId: 'tab-1', paneId: 7 })
    document.removeEventListener('dictation:insertText', listener)

    expect(listener).toHaveBeenCalledTimes(1)
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
      text: 'git status',
      tabId: 'tab-1',
      paneId: 7
    })
    expect(writeClipboardText).not.toHaveBeenCalled()
  })

  it('copies dictation to the clipboard when no target can take it', async () => {
    const unfocused = appendTextarea()
    appendTextarea()
    const detached = document.createElement('textarea')

    insertText('to terminal', { kind: 'terminal', tabId: 'gone', paneId: 1 })
    insertText('to detached', { kind: 'text', element: detached })
    insertText('to unfocused', { kind: 'text', element: unfocused })
    await vi.waitFor(() => expect(writeClipboardText).toHaveBeenCalledTimes(3))

    expect(writeClipboardText.mock.calls.map(([text]) => text).sort()).toEqual([
      'to detached',
      'to terminal',
      'to unfocused'
    ])
  })

  it('chunks large textarea dictation without one large input event', async () => {
    vi.useFakeTimers()
    const textarea = appendTextarea()
    const inputEvents: InputEvent[] = []
    textarea.addEventListener('input', (event) => inputEvents.push(event as InputEvent))
    const text = 'a'.repeat(TEXT_CONTROL_PASTE_DIRECT_MAX_BYTES + 5)

    insertText(text, { kind: 'text', element: textarea })
    await vi.runAllTimersAsync()

    expect(textarea.value).toBe(text)
    expect(inputEvents).toHaveLength(1)
    expect(inputEvents[0].inputType).toBe('insertText')
    expect(inputEvents[0].data ?? '').toBe('')
  })

  it('chunks large contenteditable dictation through bounded insertText calls', async () => {
    vi.useFakeTimers()
    const editor = appendContentEditable()
    const beforeInputEvents: InputEvent[] = []
    editor.addEventListener('beforeinput', (event) => beforeInputEvents.push(event as InputEvent))
    const execCommand = installExecCommandMock(() => true)
    const text = 'ab\u{1f600}'.repeat(20_000)

    insertText(text, { kind: 'contentEditable', element: editor })
    await vi.runAllTimersAsync()

    expect(execCommand.mock.calls.length).toBeGreaterThan(1)
    expect(
      execCommand.mock.calls.every(
        (call) => getUtf8ByteLength(String(call[2] ?? '')) <= TEXT_CONTROL_PASTE_CHUNK_MAX_BYTES
      )
    ).toBe(true)
    expect(beforeInputEvents).toHaveLength(execCommand.mock.calls.length)
    expect(beforeInputEvents.some((event) => event.data === text)).toBe(false)
  })

  it('waits for yielded contenteditable dictation preflight before inserting large text', async () => {
    vi.useFakeTimers()
    const editor = appendContentEditable()
    const execCommand = installExecCommandMock(() => true)
    const text = 'x'.repeat(TEXT_CONTROL_PASTE_DIRECT_MAX_BYTES + 10)

    insertText(text, { kind: 'contentEditable', element: editor })

    expect(execCommand).not.toHaveBeenCalled()

    await vi.runAllTimersAsync()

    expect(execCommand).toHaveBeenCalled()
  })

  it('cancels chunked contenteditable dictation when the target disconnects', async () => {
    vi.useFakeTimers()
    const editor = appendContentEditable()
    const execCommand = installExecCommandMock(() => {
      editor.remove()
      return true
    })
    const text = 'x'.repeat(TEXT_CONTROL_PASTE_DIRECT_MAX_BYTES + 1)

    insertText(text, { kind: 'contentEditable', element: editor })
    await vi.runAllTimersAsync()

    expect(execCommand).toHaveBeenCalledTimes(1)
    expect(writeClipboardText).toHaveBeenCalledWith(text)
  })

  it('rejects oversized multibyte contenteditable dictation before inserting', async () => {
    vi.useFakeTimers()
    const editor = appendContentEditable()
    const beforeInputEvents: InputEvent[] = []
    editor.addEventListener('beforeinput', (event) => beforeInputEvents.push(event as InputEvent))
    const execCommand = installExecCommandMock(() => true)
    const text = '😀'.repeat(Math.floor(TEXT_CONTROL_PASTE_MAX_BYTES / 4) + 1)

    insertText(text, { kind: 'contentEditable', element: editor })
    await vi.runAllTimersAsync()

    expect(execCommand).not.toHaveBeenCalled()
    expect(beforeInputEvents).toHaveLength(0)
    expect(editor.textContent).toBe('')
    expect(writeClipboardText).toHaveBeenCalledWith(text)
  })
})
