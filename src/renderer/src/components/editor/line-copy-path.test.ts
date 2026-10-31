import { describe, expect, it } from 'vitest'
import { formatPathLineReference } from './line-copy-path'
import { getRemoteUrlLineRange } from './selection-copy'

const selection = (startLineNumber: number, endLineNumber: number, endColumn: number) => ({
  startLineNumber,
  startColumn: 1,
  endLineNumber,
  endColumn
})

describe('formatPathLineReference', () => {
  it('writes one line bare and a selected range as L-prefixed bounds', () => {
    const reference = (line: number, range: ReturnType<typeof selection> | null) =>
      formatPathLineReference('src/a.ts', getRemoteUrlLineRange(line, range))
    expect({
      noSelection: reference(7, null),
      clickInsideRange: reference(12, selection(10, 20, 4)),
      clickOutsideRange: reference(30, selection(10, 20, 4)),
      fullLineSelectionEndingAtNextLine: reference(10, selection(10, 21, 1)),
      singleLineSelection: reference(10, selection(10, 10, 9))
    }).toEqual({
      noSelection: 'src/a.ts:7',
      clickInsideRange: 'src/a.ts:L10-L20',
      clickOutsideRange: 'src/a.ts:30',
      fullLineSelectionEndingAtNextLine: 'src/a.ts:L10-L20',
      singleLineSelection: 'src/a.ts:10'
    })
  })
})
