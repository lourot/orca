import type { editor } from 'monaco-editor'

/** Code point ranges (inclusive) shown without a Unicode highlight box. */
const ALLOWED_CODE_POINT_RANGES: readonly (readonly [number, number])[] = [
  [0x00b0, 0x00b0], // degree sign
  [0x00c0, 0x00ff], // Latin-1 letters
  [0x03b0, 0x03cf], // Greek lowercase
  [0x200d, 0x200d], // zero-width joiner inside emoji sequences
  [0x20a0, 0x20cf], // currency symbols
  [0x2500, 0x25ff], // box drawing, block elements, geometric shapes
  [0x2710, 0x280f], // dingbats
  [0x3105, 0x3129], // Bopomofo
  [0x4e00, 0x9fff], // CJK unified ideographs
  [0xfe0f, 0xfe0f], // emoji variation selector
  [0x1f680, 0x1f9df] // transport, symbols and supplemental emoji
]
const ALLOWED_CJK_PUNCTUATION = '：；，、。？！〜（）〈〉《》【】「」『』'

function buildAllowedCharacters(): Record<string, true> {
  const allowed: Record<string, true> = {}
  for (const [first, last] of ALLOWED_CODE_POINT_RANGES) {
    for (let codePoint = first; codePoint <= last; codePoint += 1) {
      allowed[String.fromCodePoint(codePoint)] = true
    }
  }
  for (const character of ALLOWED_CJK_PUNCTUATION) {
    allowed[character] = true
  }
  return allowed
}

// Built once: the editor options object is recreated on every render.
const ALLOWED_CHARACTERS = buildAllowedCharacters()

/**
 * Display and typing defaults for the file editor: every whitespace shown, rulers, no
 * auto-closing, spaces for indentation, and any non-ASCII character outside the allowlist
 * boxed so invisible or look-alike characters stand out.
 */
export function buildFileEditorDisplayOptions(
  language: string
): editor.IStandaloneEditorConstructionOptions {
  return {
    renderWhitespace: 'all',
    // Why font: the default SVG dots take the theme colour and ignore main.css's whitespace colour.
    experimentalWhitespaceRendering: 'font',
    rulers: [80, 100, 120],
    occurrencesHighlight: 'off',
    autoClosingBrackets: 'never',
    autoClosingQuotes: 'never',
    insertSpaces: true,
    detectIndentation: false,
    unicodeHighlight: {
      // Markdown prose is full of look-alike punctuation, as upstream decided.
      ambiguousCharacters: language !== 'markdown',
      invisibleCharacters: true,
      nonBasicASCII: true,
      includeComments: true,
      includeStrings: true,
      allowedCharacters: ALLOWED_CHARACTERS
    }
  }
}
