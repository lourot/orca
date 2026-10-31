import { describe, expect, it } from 'vitest'
import { getMarkdownDocLinkTargetAt } from './use-monaco-doc-link-follow'

/** The target under the first `^` marker, with the marker removed from the text. */
function targetAt(markedLines: string[]): string | null {
  const lineIndex = markedLines.findIndex((line) => line.includes('^'))
  const column = markedLines[lineIndex].indexOf('^') + 1
  const lines = markedLines.map((line) => line.replace('^', ''))
  return getMarkdownDocLinkTargetAt(
    lines.join('\n'),
    { lineNumber: lineIndex + 1, column },
    lines[lineIndex]
  )
}

describe('getMarkdownDocLinkTargetAt', () => {
  it('finds the wiki-link under the click, as the source view decorates it', () => {
    expect({
      onName: targetAt(['see [[vi^ncent]] today']),
      onOpeningBrackets: targetAt(['see ^[[vincent]] today']),
      onClosingBrackets: targetAt(['see [[vincent]^] today']),
      justAfter: targetAt(['see [[vincent]]^ today']),
      alias: targetAt(['[[people/vincent|Vin^ce]]']),
      heading: targetAt(['[[festivals#Sum^mer]]']),
      secondLink: targetAt(['[[a]] and [[b^]]']),
      inlineCode: targetAt(['`[[no^t]]`']),
      fenced: targetAt(['```', '[[no^t]]', '```'])
    }).toEqual({
      onName: 'vincent',
      onOpeningBrackets: 'vincent',
      onClosingBrackets: 'vincent',
      justAfter: null,
      alias: 'people/vincent',
      heading: 'festivals#Summer',
      secondLink: 'b',
      inlineCode: null,
      fenced: null
    })
  })
})
