import { useMemo, useRef } from 'react'
import { insertText, type DictationInsertionTarget } from './dictation-insertion-target'
import { formatFinalTranscriptSegment } from './dictation-final-segments'
import { polishDictationTranscript } from './dictation-transcript-polish'

export type DictationTranscriptBuffer = {
  /** Starts a session; the setting is read once so toggling it mid-dictation cannot split a transcript. */
  reset: (cleanupEnabled: boolean) => void
  /** Buffers a final segment when cleanup is on; false means the caller inserts it now. */
  buffer: (text: string) => boolean
  /** Polishes the buffered transcript and inserts it once into the target. */
  finish: (
    sessionId: string,
    target: DictationInsertionTarget | null,
    onPolishing: () => void
  ) => Promise<void>
  /** Inserts the buffered transcript unpolished, e.g. when speech fails mid-dictation. */
  insertRaw: (target: DictationInsertionTarget | null) => void
  /** Cancels a running cleanup; the raw transcript is inserted instead. */
  skip: () => void
}

/** Holds the final segments of a dictation until it ends, when transcript cleanup is enabled. */
export function useDictationTranscriptBuffer(): DictationTranscriptBuffer {
  const enabledRef = useRef(false)
  const pendingRef = useRef('')
  const skipRef = useRef<AbortController | null>(null)
  return useMemo(() => {
    const take = (): string => {
      const transcript = pendingRef.current
      pendingRef.current = ''
      return transcript
    }
    return {
      reset: (cleanupEnabled) => {
        enabledRef.current = cleanupEnabled
        pendingRef.current = ''
      },
      buffer: (text) => {
        if (!enabledRef.current) {
          return false
        }
        pendingRef.current += formatFinalTranscriptSegment(text, pendingRef.current)
        return true
      },
      finish: async (sessionId, target, onPolishing) => {
        const transcript = take()
        if (!transcript || !target) {
          return
        }
        onPolishing()
        const skip = new AbortController()
        skipRef.current = skip
        try {
          insertText(await polishDictationTranscript(sessionId, transcript, skip.signal), target)
        } finally {
          skipRef.current = null
        }
      },
      insertRaw: (target) => {
        const transcript = take()
        if (transcript && target) {
          insertText(transcript, target)
        }
      },
      skip: () => skipRef.current?.abort()
    }
  }, [])
}
