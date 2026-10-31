import { describe, expect, it } from 'vitest'
import { findKeywordHighlights } from './keyword-highlight-matcher'

/** Each line's highlights as the text they cover, keyed by kind. */
function covered(fileName: string, line: string): Record<string, string[]> {
  const byKind: Record<string, string[]> = {}
  for (const highlight of findKeywordHighlights(fileName, [line])) {
    ;(byKind[highlight.kind] ??= []).push(
      line.slice(highlight.startColumn - 1, highlight.endColumn - 1)
    )
  }
  return byKind
}

describe('findKeywordHighlights', () => {
  it('badges keywords after a comment opener and the rest of that comment', () => {
    expect({
      slashes: covered('a.ts', 'x() // TODO: wire this'),
      hash: covered('a.sh', '# FIXME(api) retry'),
      block: covered('a.css', '/* HACK keep */ a {}'),
      html: covered('a.html', '<!-- BUG: double render -->'),
      sql: covered('a.sql', '-- DEBUG drop me'),
      jsdoc: covered('a.ts', ' * @UGLY workaround'),
      keywordOnly: covered('a.ts', '// FIX'),
      notAfterOpener: covered('a.md', '- TODO buy milk'),
      longerWord: covered('a.ts', '// FIXED already'),
      laIdentifier: covered('a.ts', 'const x = LA_TOGGLE + 1'),
      laInsideWord: covered('a.ts', 'VILLA_ROSE'),
      changelog: covered('CHANGELOG.md', '# FIX crash on start')
    }).toEqual({
      slashes: { keyword: ['// TODO:'], comment: [' wire this'] },
      hash: { keyword: ['# FIXME(api)'], comment: [' retry'] },
      block: { keyword: ['/* HACK'], comment: [' keep'] },
      html: { keyword: ['<!-- BUG:'], comment: [' double render'] },
      sql: { keyword: ['-- DEBUG'], comment: [' drop me'] },
      jsdoc: { keyword: ['* @UGLY'], comment: [' workaround'] },
      keywordOnly: { keyword: ['// FIX'] },
      notAfterOpener: {},
      longerWord: {},
      laIdentifier: { 'la-identifier': ['LA_TOGGLE'] },
      laInsideWord: {},
      changelog: {}
    })
  })
})
