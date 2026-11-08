// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import {
  DICTATION_AGENT_INPUT_ATTRIBUTE,
  terminalDictationText,
  wrapDictationForAgent
} from './dictation-agent-disclaimer'
import type { DictationInsertionTarget } from './dictation-insertion-target'

function chatPromptElement(): HTMLElement {
  const editor = document.createElement('div')
  editor.setAttribute(DICTATION_AGENT_INPUT_ATTRIBUTE, 'true')
  const paragraph = document.createElement('p')
  editor.append(paragraph)
  return paragraph
}

const targets: Record<string, DictationInsertionTarget> = {
  terminal: { kind: 'terminal', tabId: 'tab-1', paneId: 1 },
  composer: { kind: 'composer', insert: () => undefined },
  chatPrompt: { kind: 'contentEditable', element: chatPromptElement() },
  otherEditor: { kind: 'contentEditable', element: document.createElement('div') },
  text: { kind: 'text', element: document.createElement('textarea') }
}

describe('wrapDictationForAgent', () => {
  it('wraps only agent-facing targets, saying whether the text was cleaned up', () => {
    const wrapped = Object.fromEntries(
      Object.entries(targets).map(([name, target]) => [
        name,
        [true, false].map((polished) => {
          const out = wrapDictationForAgent('fix the bug', target, polished)
          if (out === null) {
            return 'plain'
          }
          expect(out).toMatch(/^<dictated-text note="[^"]+">\nfix the bug\n<\/dictated-text>$/)
          return out.includes('not cleaned up') ? 'raw note' : 'polished note'
        })
      ])
    )

    expect(wrapped).toEqual({
      terminal: ['polished note', 'raw note'],
      composer: ['polished note', 'raw note'],
      chatPrompt: ['polished note', 'raw note'],
      otherEditor: ['plain', 'plain'],
      text: ['plain', 'plain']
    })
  })

  it('gives a terminal the wrapped text only in bracketed-paste mode, else the plain text on one line', () => {
    const text = 'rm old  \r\n\n  list files\n'
    expect({
      bracketed: terminalDictationText(text, '<wrapped/>', true),
      bracketedUnwrapped: terminalDictationText(text, undefined, true),
      plain: terminalDictationText(text, '<wrapped/>', false)
    }).toEqual({
      bracketed: '<wrapped/>',
      bracketedUnwrapped: text,
      plain: 'rm old list files '
    })
  })
})
