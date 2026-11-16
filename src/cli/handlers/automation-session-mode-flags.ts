import { RuntimeClientError } from '../runtime-client'
import { getKeepSessionOpenFlag } from './automation-handler-flags'

const SESSION_MODE_FLAGS = ['fresh-session', 'reuse-session', 'skip-if-session-open'] as const

/** Fresh, reuse and skip-if-open are one exclusive choice; keep-open is separate. No flag leaves the saved value. */
export function getSessionModeFlags(flags: Map<string, string | boolean>): {
  reuseSession: boolean | undefined
  skipWhileSessionOpen: boolean | undefined
  keepSessionOpen: boolean | undefined
} {
  const keepSessionOpen = getKeepSessionOpenFlag(flags)
  for (const name of SESSION_MODE_FLAGS) {
    if (typeof flags.get(name) === 'string') {
      throw new RuntimeClientError('invalid_argument', `--${name} does not take a value`)
    }
  }
  const chosen = SESSION_MODE_FLAGS.filter((name) => flags.get(name) === true)
  if (chosen.length > 1) {
    throw new RuntimeClientError(
      'invalid_argument',
      `Use only one of ${SESSION_MODE_FLAGS.map((name) => `--${name}`).join(', ')}.`
    )
  }
  if (chosen.length === 0) {
    return { reuseSession: undefined, skipWhileSessionOpen: undefined, keepSessionOpen }
  }
  return {
    reuseSession: chosen[0] === 'reuse-session',
    skipWhileSessionOpen: chosen[0] === 'skip-if-session-open',
    keepSessionOpen
  }
}
