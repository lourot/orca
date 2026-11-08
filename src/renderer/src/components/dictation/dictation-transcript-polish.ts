import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { DictationCleanupResult } from '../../../../shared/speech-types'

// Why: Codex answers in ~5 s, but its runs are serialized per CODEX_HOME and can queue behind a commit message.
export const DICTATION_POLISH_TIMEOUT_MS = 20_000

/**
 * Asks the dictation-cleanup agent to fix the transcript. Resolves to the cleaned text, or to the raw
 * transcript on failure, timeout or skip, so dictated words are never lost.
 */
export async function polishDictationTranscript(
  sessionId: string,
  transcript: string,
  skipSignal: AbortSignal,
  timeoutMs = DICTATION_POLISH_TIMEOUT_MS
): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let onSkip: (() => void) | undefined
  const stopped = new Promise<'timeout' | 'skip'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
    onSkip = () => resolve('skip')
    if (skipSignal.aborted) {
      onSkip()
    }
    skipSignal.addEventListener('abort', onSkip, { once: true })
  })
  try {
    const outcome = await Promise.race([
      window.api.speech
        .cleanupTranscript(sessionId, transcript)
        .catch((error: unknown): DictationCleanupResult => ({ ok: false, error: String(error) })),
      stopped
    ])
    if (outcome === 'timeout' || outcome === 'skip') {
      void window.api.speech.cancelCleanup(sessionId).catch(() => undefined)
      if (outcome === 'timeout') {
        toast.message(
          translate(
            'dictation.polish.timeout',
            'Transcript cleanup took too long. Inserted the raw text.'
          )
        )
      }
      return transcript
    }
    if (outcome.ok) {
      return outcome.text
    }
    if (!outcome.canceled) {
      toast.error(
        translate(
          'dictation.polish.failed',
          'Transcript cleanup failed: {{value0}} Inserted the raw text.',
          { value0: outcome.error }
        )
      )
    }
    return transcript
  } finally {
    clearTimeout(timer)
    if (onSkip) {
      skipSignal.removeEventListener('abort', onSkip)
    }
  }
}
