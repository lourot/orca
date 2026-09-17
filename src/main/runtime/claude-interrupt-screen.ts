/**
 * What a user interrupt looks like on a Claude pane, pinned to captured transcripts.
 *
 * Claude Code emits no hook when the user interrupts a turn, so the screen is the only evidence
 * the execution host has. See docs/reference/claude-interrupt-screen-evidence.md for what each
 * transcript decides.
 */

/**
 * How long an escape keypress stays armed waiting for the marker.
 *
 * Long enough for Claude to tear down an in-flight tool call and repaint; short enough that the
 * strict baseline guards re-checked at confirmation time are still describing the same turn.
 */
export const CLAUDE_INTERRUPT_SCREEN_CONFIRM_MS = 2_000
export const CLAUDE_INTERRUPT_SCREEN_POLL_MS = 150

/**
 * The tool-result row Claude paints in place of the result it never got, e.g.
 * `  ⎿ Interrupted · What should Claude do instead?`.
 *
 * Matched with the `⎿` prefix, never the bare phrase: an agent quoting the sentence in its own
 * output would otherwise settle its own row.
 */
const CLAUDE_INTERRUPT_MARKER = '⎿ interrupted · what should claude do instead?'

/**
 * Occurrences of the interrupt marker on a pane's visible screen.
 *
 * Whitespace is collapsed because Claude places those words with absolute column moves and a
 * narrow pane wraps the row, so neither the spacing nor the line break is fixed. Callers compare
 * a count taken before the keypress with one taken after: only a *newly gained* marker is
 * evidence, or a marker left on screen by an earlier interrupt would settle the next turn.
 */
export function countClaudeInterruptMarkers(screenLines: readonly string[]): number {
  // `\s` covers the NBSP Claude writes between `⎿` and the phrase.
  const collapsed = screenLines.join(' ').toLowerCase().replace(/\s+/g, ' ')
  return collapsed.split(CLAUDE_INTERRUPT_MARKER).length - 1
}
