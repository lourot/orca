// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchOpenCodeUsage: vi.fn(async () => {})
}))

const storeState = {
  openCodeUsageScanState: { enabled: true, isScanning: false },
  openCodeUsageSummary: null,
  fetchOpenCodeUsage: mocks.fetchOpenCodeUsage
}

vi.mock('../../store', () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState)
}))

import {
  OPEN_CODE_USAGE_POLL_MS,
  useStatusBarOpenCodeUsage
} from './use-status-bar-open-code-usage'

function setDocumentVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useStatusBarOpenCodeUsage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setDocumentVisibility('visible')
    mocks.fetchOpenCodeUsage.mockClear()
  })

  afterEach(() => {
    cleanup()
    setDocumentVisibility('visible')
    vi.useRealTimers()
  })

  it('keeps refetching on an interval so the reported cost does not stay pinned to app start', async () => {
    renderHook(() => useStatusBarOpenCodeUsage())
    expect(mocks.fetchOpenCodeUsage).toHaveBeenCalledTimes(1)

    await act(async () => vi.advanceTimersByTime(OPEN_CODE_USAGE_POLL_MS))
    expect(mocks.fetchOpenCodeUsage).toHaveBeenCalledTimes(2)

    await act(async () => vi.advanceTimersByTime(OPEN_CODE_USAGE_POLL_MS))
    expect(mocks.fetchOpenCodeUsage).toHaveBeenCalledTimes(3)
  })

  it('refetches unforced so the main store decides whether a rescan is due', async () => {
    renderHook(() => useStatusBarOpenCodeUsage())
    await act(async () => vi.advanceTimersByTime(OPEN_CODE_USAGE_POLL_MS))

    for (const call of mocks.fetchOpenCodeUsage.mock.calls) {
      expect(call).toEqual([])
    }
  })

  it('skips ticks while the window is hidden and refetches on unhide', async () => {
    renderHook(() => useStatusBarOpenCodeUsage())
    mocks.fetchOpenCodeUsage.mockClear()

    await act(async () => setDocumentVisibility('hidden'))
    await act(async () => vi.advanceTimersByTime(OPEN_CODE_USAGE_POLL_MS * 3))
    expect(mocks.fetchOpenCodeUsage).not.toHaveBeenCalled()

    await act(async () => setDocumentVisibility('visible'))
    expect(mocks.fetchOpenCodeUsage).toHaveBeenCalledTimes(1)
  })

  it('stops polling after unmount', async () => {
    const hook = renderHook(() => useStatusBarOpenCodeUsage())
    hook.unmount()
    mocks.fetchOpenCodeUsage.mockClear()

    await act(async () => vi.advanceTimersByTime(OPEN_CODE_USAGE_POLL_MS * 2))
    expect(mocks.fetchOpenCodeUsage).not.toHaveBeenCalled()
  })
})
