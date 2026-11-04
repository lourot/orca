import { describe, expect, it } from 'vitest'
import { markdownEnterEdit, markdownListIndentEdit } from './markdown-list-editing'

/** Enter at the `|` marker; the result written back with `|` at the new cursor. */
function enter(marked: string): string | null {
  const column = marked.indexOf('|') + 1
  const edit = markdownEnterEdit(marked.replace('|', ''), column, '  ')
  if (!edit) {
    return null
  }
  const last = edit.nextLine ?? edit.line
  const withCursor = `${last.slice(0, edit.cursorColumn - 1)}|${last.slice(edit.cursorColumn - 1)}`
  return edit.nextLine === undefined ? withCursor : `${edit.line}\n${withCursor}`
}

describe('markdownEnterEdit', () => {
  it('continues lists and quotes, and ends them on an empty item', () => {
    expect({
      bullet: enter('- milk|'),
      star: enter('* milk|'),
      nested: enter('    + eggs|'),
      numbered: enter('9. ninth|'),
      parenNumbered: enter('3) third|'),
      checkedBox: enter('- [x] done|'),
      openBox: enter('1. [ ] todo|'),
      midLine: enter('- foo |bar'),
      quote: enter('> said|'),
      listInQuote: enter('> - item|'),
      emptyItem: enter('- |'),
      emptyNestedItem: enter('    - |'),
      emptyItemInQuote: enter('> - |'),
      emptyQuote: enter('> |'),
      cursorBeforeMarker: enter('|- milk'),
      plainText: enter('just text|'),
      horizontalRule: enter('---|'),
      notAMarker: enter('-dash|')
    }).toEqual({
      bullet: '- milk\n- |',
      star: '* milk\n* |',
      nested: '    + eggs\n    + |',
      numbered: '9. ninth\n10. |',
      parenNumbered: '3) third\n4) |',
      checkedBox: '- [x] done\n- [ ] |',
      openBox: '1. [ ] todo\n2. [ ] |',
      midLine: '- foo \n- |bar',
      quote: '> said\n> |',
      listInQuote: '> - item\n> - |',
      emptyItem: '|',
      emptyNestedItem: '  - |',
      emptyItemInQuote: '> |',
      emptyQuote: '|',
      cursorBeforeMarker: null,
      plainText: null,
      horizontalRule: null,
      notAMarker: null
    })
  })
})

describe('markdownListIndentEdit', () => {
  it('moves list items a level after any quote markers and leaves other lines alone', () => {
    const edit = (line: string, direction: 'indent' | 'outdent') =>
      markdownListIndentEdit(line, direction, '  ')
    expect({
      indent: edit('- a', 'indent'),
      indentInQuote: edit('> - a', 'indent'),
      outdent: edit('    - a', 'outdent'),
      outdentTab: edit('\t- a', 'outdent'),
      outdentTopLevel: edit('- a', 'outdent'),
      plainLine: edit('text', 'indent')
    }).toEqual({
      indent: { line: '  - a', columnShift: 2 },
      indentInQuote: { line: '>   - a', columnShift: 2 },
      outdent: { line: '  - a', columnShift: -2 },
      outdentTab: { line: '- a', columnShift: -1 },
      outdentTopLevel: null,
      plainLine: null
    })
  })
})
