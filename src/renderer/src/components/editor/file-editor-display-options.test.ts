import { describe, expect, it } from 'vitest'
import { buildFileEditorDisplayOptions } from './file-editor-display-options'

describe('buildFileEditorDisplayOptions', () => {
  it('allows the listed scripts and symbols and boxes everything else non-ASCII', () => {
    const unicode = buildFileEditorDisplayOptions('typescript').unicodeHighlight
    const allowed = unicode?.allowedCharacters ?? {}
    const samples = ['é', 'ß', '°', 'λ', '€', '│', '✔', '中', '，', '🚀', '\u200d', '\ufe0f']
    const boxed = ['→', '“', '—', '\u200b', 'ő', '😀']
    expect({
      allowed: samples.filter((character) => allowed[character]),
      boxed: boxed.filter((character) => allowed[character])
    }).toEqual({ allowed: samples, boxed: [] })
  })

  it('keeps ambiguous-character boxes out of Markdown only', () => {
    expect([
      buildFileEditorDisplayOptions('markdown').unicodeHighlight?.ambiguousCharacters,
      buildFileEditorDisplayOptions('typescript').unicodeHighlight?.ambiguousCharacters
    ]).toEqual([false, true])
  })
})
