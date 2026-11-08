import { describe, expect, it } from 'vitest'
import {
  buildDictationCleanupPrompt,
  sanitizeDictationCleanupOutput
} from './dictation-cleanup-prompt'

describe('dictation cleanup prompt', () => {
  it('carries the trimmed transcript and appends custom instructions only when set', () => {
    const plain = buildDictationCleanupPrompt({ transcript: '  run p n p m test  ' })
    expect(plain.endsWith('\nrun p n p m test')).toBe(true)
    expect(plain).not.toContain('Additional instructions')

    const custom = buildDictationCleanupPrompt({ transcript: 'x' }, 'Vocabulary: Orca, pnpm')
    expect(custom.endsWith('\n\nAdditional instructions:\nVocabulary: Orca, pnpm')).toBe(true)
  })

  it.each([
    ['plain text', 'Open Orca and run pnpm test.', 'Open Orca and run pnpm test.'],
    ['surrounding whitespace', '\n  Open Orca.  \n', 'Open Orca.'],
    ['straight quotes', '"Open Orca."', 'Open Orca.'],
    ['curly quotes', '“Open Orca.”', 'Open Orca.'],
    ['code fence', '```\nOpen Orca.\n```', 'Open Orca.'],
    ['multiple paragraphs', 'First.\n\nSecond.', 'First.\n\nSecond.'],
    ['inner quotes kept', 'Say "hi" to Orca', 'Say "hi" to Orca'],
    ['empty output', '   ', null],
    ['reasoning only', '<think>hmm', null]
  ])('sanitizes %s', (_case, raw, expected) => {
    expect(sanitizeDictationCleanupOutput(raw)).toBe(expected)
  })
})
