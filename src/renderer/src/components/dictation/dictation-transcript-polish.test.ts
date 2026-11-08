import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: Object.assign(() => undefined, { message: () => undefined, error: () => undefined })
}))

import { polishDictationTranscript } from './dictation-transcript-polish'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('polishDictationTranscript', () => {
  it('returns the raw transcript and cancels the agent when it times out', async () => {
    const cancelCleanup = vi.fn(async () => undefined)
    vi.stubGlobal('window', {
      api: { speech: { cleanupTranscript: () => new Promise(() => undefined), cancelCleanup } }
    })

    const result = await polishDictationTranscript(
      '7',
      'raw words',
      new AbortController().signal,
      5
    )

    expect(result).toEqual({ text: 'raw words', polished: false })
    expect(cancelCleanup).toHaveBeenCalledWith('7')
  })
})
