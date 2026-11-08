import type { DictationInsertionTarget } from './dictation-insertion-target'

/** Marks an editable element whose text goes to an agent, e.g. the native chat prompt. */
export const DICTATION_AGENT_INPUT_ATTRIBUTE = 'data-dictation-agent-input'

const SPELLING_HINT =
  'names, identifiers and technical terms may be misspelled. Interpret by sound and check spellings against the repository.'

function isAgentFacingTarget(target: DictationInsertionTarget): boolean {
  if (target.kind === 'terminal' || target.kind === 'composer') {
    return true
  }
  return (
    target.kind === 'contentEditable' &&
    target.element.closest(`[${DICTATION_AGENT_INPUT_ATTRIBUTE}]`) !== null
  )
}

/**
 * Wraps dictation bound for an agent (terminal, chat prompt or composer) in a note that it came
 * from speech: the speech pipeline never sees the repository, so names and identifiers come out
 * misspelled. Null for other fields (commit message, search, rename), which get plain text.
 */
export function wrapDictationForAgent(
  text: string,
  target: DictationInsertionTarget,
  polished: boolean
): string | null {
  if (!isAgentFacingTarget(target)) {
    return null
  }
  const origin = polished
    ? 'Transcribed from speech, then cleaned up by an AI that cannot see the repository'
    : 'Raw speech-to-text output, not cleaned up'
  return `<dictated-text note="${origin}; ${SPELLING_HINT}">\n${text}\n</dictated-text>`
}

/**
 * Picks what a terminal pane receives. Without bracketed paste each line break is an Enter, so
 * dictated lines would run before the user reviews them: such panes get the plain text on one line.
 */
export function terminalDictationText(
  text: string,
  agentText: string | undefined,
  bracketedPasteMode: boolean
): string {
  if (bracketedPasteMode) {
    return agentText ?? text
  }
  return text.replace(/[^\S\n]*\r?\n\s*/g, ' ')
}
