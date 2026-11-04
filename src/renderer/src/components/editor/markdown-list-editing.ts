// Leading indent, blockquote markers, the list's own indent, then an optional list marker and
// task checkbox. Everything after the prefix is the item's text.
const LINE_PREFIX =
  /^(?<indent>[ \t]*)(?<quote>(?:>[ \t]?)*)(?<listIndent>[ \t]*)(?:(?<marker>[-*+]|\d{1,9}[.)])(?<markerSpace>[ \t]+|$))?(?:(?<box>\[[ xX]\])(?<boxSpace>[ \t]+|$))?/

type MarkdownLinePrefix = {
  /** The full prefix text, marker and checkbox included. */
  prefix: string
  /** The prefix the next line starts with; null when the line is neither a list item nor a quote. */
  continuation: string | null
  /** What an ended list leaves: its blockquote markers, if any. */
  container: string
  /** Where the list's indentation starts: after any blockquote markers. */
  listIndentStart: number
  isListItem: boolean
}

function parseLinePrefix(line: string): MarkdownLinePrefix {
  const groups = LINE_PREFIX.exec(line)?.groups ?? {}
  const { indent = '', quote = '', listIndent = '', marker, markerSpace = '' } = groups
  const { box, boxSpace = '' } = groups
  const quoted = quote !== ''
  const container = quoted ? `${indent}${quote}` : ''
  if (!marker) {
    return {
      prefix: `${indent}${quote}`,
      continuation: quoted ? `${indent}${quote}` : null,
      container,
      listIndentStart: container.length,
      isListItem: false
    }
  }
  const head = `${indent}${quote}${listIndent}`
  const ordered = /^(\d+)([.)])$/.exec(marker)
  const nextMarker = ordered ? `${Number(ordered[1]) + 1}${ordered[2]}` : marker
  return {
    prefix: `${head}${marker}${markerSpace}${box ? `${box}${boxSpace}` : ''}`,
    continuation: `${head}${nextMarker}${markerSpace || ' '}${box ? `[ ]${boxSpace || ' '}` : ''}`,
    container,
    listIndentStart: container.length,
    isListItem: true
  }
}

/**
 * Tab and Shift-Tab on a list item move the whole item one level, the indent going after any
 * blockquote markers. Null for lines that are not list items, or nothing left to outdent.
 */
export function markdownListIndentEdit(
  line: string,
  direction: 'indent' | 'outdent',
  indentUnit: string
): { line: string; columnShift: number } | null {
  const parsed = parseLinePrefix(line)
  if (!parsed.isListItem) {
    return null
  }
  const start = parsed.listIndentStart
  if (direction === 'indent') {
    return {
      line: `${line.slice(0, start)}${indentUnit}${line.slice(start)}`,
      columnShift: indentUnit.length
    }
  }
  const leading = /^[ \t]*/.exec(line.slice(start))?.[0] ?? ''
  const removed = leading.startsWith('\t') ? 1 : Math.min(leading.length, indentUnit.length)
  return removed === 0
    ? null
    : { line: `${line.slice(0, start)}${line.slice(start + removed)}`, columnShift: -removed }
}

export type MarkdownEnterEdit = {
  /** The cursor's line after the edit. */
  line: string
  /** The line inserted below it; absent when Enter only ended or outdented the item. */
  nextLine?: string
  /** Cursor column (1-based) on the last line written. */
  cursorColumn: number
}

/**
 * What Enter does at `column` (1-based) of a Markdown list item or blockquote line: carry the
 * marker onto a new line (the next number, an unchecked box). On an item holding only its marker
 * it outdents a nested item, or else removes the marker to end the list. Null means a plain
 * newline: not a list or quote line, or the cursor sits before the item's text.
 */
export function markdownEnterEdit(
  line: string,
  column: number,
  indentUnit: string
): MarkdownEnterEdit | null {
  const parsed = parseLinePrefix(line)
  const cursor = column - 1
  if (parsed.continuation === null || cursor < parsed.prefix.length) {
    return null
  }
  const before = line.slice(0, cursor)
  const after = line.slice(cursor)
  if (before.slice(parsed.prefix.length).trim() !== '' || after.trim() !== '') {
    return {
      line: before,
      nextLine: `${parsed.continuation}${after.trimStart()}`,
      cursorColumn: parsed.continuation.length + 1
    }
  }
  const outdented = markdownListIndentEdit(line, 'outdent', indentUnit)
  if (outdented) {
    return { line: outdented.line, cursorColumn: outdented.line.length + 1 }
  }
  // An empty list item keeps its blockquote markers; an empty quote line leaves the quote.
  const ended = parsed.isListItem ? parsed.container : ''
  return { line: ended, cursorColumn: ended.length + 1 }
}
