export type KeywordHighlightKind = 'keyword' | 'comment' | 'la-identifier'

/** One highlighted span on a line; columns are Monaco's (1-based, end exclusive). */
export type KeywordHighlight = {
  lineNumber: number
  startColumn: number
  endColumn: number
  kind: KeywordHighlightKind
}

// A comment opener (#, //, /*, <!--, --, JSDoc ` * @`, Handlebars {{! / {!), then the keyword with
// an optional `(scope)` and colon. The trailing lookahead keeps FIXED or TODOS out.
const KEYWORD_AFTER_COMMENT_OPENER =
  /(?:#|\/\/ @|\/\/|\/\*+|<!--|--|\* @|\{\{!--|\{\{!|\{!) *(?:TODO|FIXME|FIX|BUG|UGLY|DEBUG|HACK)(?:\s*\([^)]+\))?:?(?!\w)/g
const COMMENT_CLOSERS = ['-->', '*/', '--}}', '}}', '!}']
const LA_IDENTIFIER = /(?<!\w)LA_\w*/g

/** Where the rest of a keyword comment ends: a comment closer, or the end of the line. */
function commentTextEnd(line: string, from: number): number {
  let end = line.length
  for (const closer of COMMENT_CLOSERS) {
    const index = line.indexOf(closer, from)
    if (index !== -1 && index < end) {
      end = index
    }
  }
  while (end > from && (line[end - 1] === ' ' || line[end - 1] === '\t')) {
    end -= 1
  }
  return end
}

/**
 * The TODO-style comment badges and `LA_` identifiers in `lines`. Files named CHANGELOG.md get
 * none: their entries routinely mention "fix" and "bug" in prose.
 */
export function findKeywordHighlights(
  fileName: string,
  lines: readonly string[]
): KeywordHighlight[] {
  if (fileName === 'CHANGELOG.md') {
    return []
  }
  const highlights: KeywordHighlight[] = []
  lines.forEach((line, index) => {
    const lineNumber = index + 1
    for (const match of line.matchAll(KEYWORD_AFTER_COMMENT_OPENER)) {
      const keywordEnd = match.index + match[0].length
      highlights.push({
        lineNumber,
        startColumn: match.index + 1,
        endColumn: keywordEnd + 1,
        kind: 'keyword'
      })
      const textEnd = commentTextEnd(line, keywordEnd)
      if (textEnd > keywordEnd) {
        highlights.push({
          lineNumber,
          startColumn: keywordEnd + 1,
          endColumn: textEnd + 1,
          kind: 'comment'
        })
      }
    }
    for (const match of line.matchAll(LA_IDENTIFIER)) {
      highlights.push({
        lineNumber,
        startColumn: match.index + 1,
        endColumn: match.index + match[0].length + 1,
        kind: 'la-identifier'
      })
    }
  })
  return highlights
}
