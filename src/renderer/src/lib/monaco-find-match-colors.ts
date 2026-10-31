import type * as Monaco from 'monaco-editor'

type MonacoModule = { editor: Pick<typeof Monaco.editor, 'defineTheme'> }
type MonacoBaseTheme = 'vs-dark' | 'vs'

const OTHER_MATCHES_AND_BORDER = {
  'editor.findMatchBorder': '#fb923c',
  'editor.findMatchHighlightBackground': '#facc1559'
}

// Why hex: Monaco cannot read CSS variables; these mirror --markdown-search-match(-active) in main.css.
// Why a darker dark fill: light text on the light orange read poorly.
export const MONACO_FIND_MATCH_COLORS: Readonly<
  Record<MonacoBaseTheme, Readonly<Record<string, string>>>
> = {
  'vs-dark': { ...OTHER_MATCHES_AND_BORDER, 'editor.findMatchBackground': '#9a3412' },
  vs: { ...OTHER_MATCHES_AND_BORDER, 'editor.findMatchBackground': '#fb923c99' }
}

/** Gives the built-in themes Orca's find-match colors; Monaco's grey current match is easy to miss. */
export function defineMonacoFindMatchThemes(monaco: MonacoModule): void {
  for (const base of ['vs-dark', 'vs'] as const) {
    monaco.editor.defineTheme(base, {
      base,
      inherit: true,
      rules: [],
      colors: MONACO_FIND_MATCH_COLORS[base]
    })
  }
}
