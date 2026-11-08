// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  DictationCleanupResult,
  DictationState,
  SpeechLifecycleEvent,
  SpeechTranscriptEvent
} from '../../../../shared/speech-types'

type MockStoreState = {
  dictationState: DictationState
  settings: Record<string, unknown>
  keybindings: Record<string, never>
  setDictationState: (next: DictationState) => void
  setPartialTranscript: () => void
  recordFeatureInteraction: () => void
}

const mocks = vi.hoisted(() => {
  const target = { kind: 'terminal' as const, tabId: 'tab-1', paneId: 1 }
  const state: MockStoreState = {
    dictationState: 'idle',
    settings: {},
    keybindings: {},
    setDictationState: (next: DictationState) => {
      state.dictationState = next
    },
    setPartialTranscript: () => undefined,
    recordFeatureInteraction: () => undefined
  }
  const indicatorProps: { onSkipPolish?: () => void } = {}
  return {
    target,
    state,
    insertText: vi.fn<(text: string, insertionTarget: unknown) => void>(),
    indicatorProps
  }
})

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    { getState: () => mocks.state }
  )
}))
vi.mock('@/hooks/use-audio-capture', () => ({
  useAudioCapture: () => ({
    start: async () => ({}),
    stop: () => undefined,
    flushBufferedAudio: async () => undefined,
    discardBufferedAudio: () => undefined,
    getCapturedChunkCount: () => 1
  })
}))
vi.mock('./dictation-insertion-target', () => ({
  captureInsertionTarget: () => mocks.target,
  insertText: mocks.insertText
}))
vi.mock('./use-hold-dictation-gesture', () => ({ useHoldDictationGesture: () => undefined }))
vi.mock('./DictationIndicator', () => ({
  DictationIndicator: (props: { onSkipPolish?: () => void }) => {
    mocks.indicatorProps.onSkipPolish = props.onSkipPolish
    return null
  }
}))
vi.mock('sonner', () => ({
  toast: Object.assign(() => undefined, { message: () => undefined, error: () => undefined })
}))

import { DictationController } from './DictationController'

let root: Root | null = null
let pressDictationKey: () => void
let emitFinal: (data: SpeechTranscriptEvent) => void
let emitStopped: (data: SpeechLifecycleEvent) => void
let emitError: (data: { sessionId: string; error: string }) => void
let finalsAfterStop: string[]
let cleanupTranscript: ReturnType<
  typeof vi.fn<(sessionId: string, transcript: string) => Promise<DictationCleanupResult>>
>
let cancelCleanup: ReturnType<typeof vi.fn<(sessionId: string) => Promise<void>>>

async function mount(transcriptCleanupEnabled: boolean): Promise<void> {
  mocks.state.settings = {
    voice: { enabled: true, sttModel: 'model', dictationMode: 'toggle', transcriptCleanupEnabled }
  }
  const container = document.createElement('div')
  root = createRoot(container)
  await act(async () => {
    root?.render(<DictationController />)
  })
}

/** Dictates one session: `during` arrive while listening, `finalsAfterStop` once stop is requested. */
async function dictate(during: string[], after: string[]): Promise<void> {
  finalsAfterStop = after
  await act(async () => pressDictationKey())
  await vi.waitFor(() => expect(mocks.state.dictationState).toBe('listening'))
  for (const text of during) {
    emitFinal({ sessionId: '1', text })
  }
  await act(async () => pressDictationKey())
}

async function waitForIdle(): Promise<void> {
  await vi.waitFor(() => expect(mocks.state.dictationState).toBe('idle'))
}

beforeEach(() => {
  mocks.state.dictationState = 'idle'
  mocks.insertText.mockReset()
  mocks.indicatorProps.onSkipPolish = undefined
  cleanupTranscript = vi.fn(async () => ({ ok: true as const, text: 'Cleaned text.' }))
  cancelCleanup = vi.fn(async () => undefined)
  vi.stubGlobal('api', {
    ui: {
      onDictationKeyDown: (callback: () => void) => {
        pressDictationKey = callback
        return () => undefined
      }
    },
    speech: {
      startDictation: async () => undefined,
      stopDictation: async (sessionId: string) => {
        for (const text of finalsAfterStop) {
          emitFinal({ sessionId, text })
        }
        emitStopped({ sessionId })
      },
      onPartialTranscript: () => () => undefined,
      onFinalTranscript: (callback: (data: SpeechTranscriptEvent) => void) => {
        emitFinal = callback
        return () => undefined
      },
      onStopped: (callback: (data: SpeechLifecycleEvent) => void) => {
        emitStopped = callback
        return () => undefined
      },
      onError: (callback: (data: { sessionId: string; error: string }) => void) => {
        emitError = callback
        return () => undefined
      },
      cleanupTranscript,
      cancelCleanup
    }
  })
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  vi.unstubAllGlobals()
})

describe('DictationController transcript cleanup', () => {
  it('inserts the cleaned text once, after finals from both listening and stop', async () => {
    await mount(true)
    await dictate(['so I want'], ['open or car'])
    await waitForIdle()

    expect(cleanupTranscript).toHaveBeenCalledExactlyOnceWith('1', 'so I want open or car')
    expect(mocks.insertText.mock.calls).toEqual([['Cleaned text.', mocks.target]])
  })

  it.each([
    ['an error result', async () => ({ ok: false as const, error: 'agent missing' })],
    [
      'a rejected IPC call',
      async (): Promise<DictationCleanupResult> => {
        throw new Error('ipc down')
      }
    ]
  ])('inserts the raw text once on %s', async (_case, implementation) => {
    cleanupTranscript.mockImplementation(implementation)
    await mount(true)
    await dictate(['so I want'], ['open or car'])
    await waitForIdle()

    expect(mocks.insertText.mock.calls).toEqual([['so I want open or car', mocks.target]])
  })

  it('inserts the raw text once and cancels the agent when skipped', async () => {
    cleanupTranscript.mockImplementation(() => new Promise(() => undefined))
    await mount(true)
    await dictate(['so I want'], [])
    await vi.waitFor(() => expect(mocks.state.dictationState).toBe('polishing'))
    await act(async () => mocks.indicatorProps.onSkipPolish?.())
    await waitForIdle()

    expect(mocks.insertText.mock.calls).toEqual([['so I want', mocks.target]])
    expect(cancelCleanup).toHaveBeenCalledWith('1')
  })

  it('inserts the buffered raw text once when speech fails mid-dictation', async () => {
    await mount(true)
    finalsAfterStop = []
    await act(async () => pressDictationKey())
    await vi.waitFor(() => expect(mocks.state.dictationState).toBe('listening'))
    emitFinal({ sessionId: '1', text: 'so I want' })
    await act(async () => emitError({ sessionId: '1', error: 'worker crashed' }))
    await waitForIdle()

    expect(cleanupTranscript).not.toHaveBeenCalled()
    expect(mocks.insertText.mock.calls).toEqual([['so I want', mocks.target]])
  })

  it('inserts each final as it arrives when cleanup is off', async () => {
    await mount(false)
    await dictate(['so I want'], ['open or car'])
    await waitForIdle()

    expect(cleanupTranscript).not.toHaveBeenCalled()
    expect(mocks.insertText.mock.calls).toEqual([
      ['so I want', mocks.target],
      [' open or car', mocks.target]
    ])
  })
})
