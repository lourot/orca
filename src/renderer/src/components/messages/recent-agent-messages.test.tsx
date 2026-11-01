// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as RecencyModule from './recent-agent-messages'
import type {
  AgentMessageLogEntry,
  AgentMessageLogLatestResult,
  AgentMessageLogListResult
} from '../../../../shared/agent-message-log-contract'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), visible: true }))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: mocks.rpc }))
vi.mock('@/hooks/use-window-stream-visibility', () => ({
  useWindowStreamVisible: () => mocks.visible
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { closeMessagesPage: () => void }) => unknown) =>
    selector({ closeMessagesPage: () => {} })
}))

const RECENT_MS = 72 * 60 * 60 * 1000
let recency: typeof RecencyModule

/** Holds a metadata reply so tests can exercise real response ordering. */
function pendingReply<T = AgentMessageLogLatestResult>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve: (value: T) => void = () => {
    throw new Error('Promise not initialized')
  }
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** A logged send without workspace metadata. */
function logEntry(): AgentMessageLogEntry {
  return {
    id: 1,
    sentAt: Date.now(),
    text: 'Please review',
    outcome: 'accepted',
    refusedReason: null,
    targetHandle: 'term_1',
    worktreeId: null,
    worktreePath: null,
    branch: null,
    terminalTitle: null,
    agent: null
  }
}

describe('recent agent messages', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'))
    window.localStorage.clear()
    mocks.visible = true
    mocks.rpc.mockReset().mockResolvedValue({ latest: null })
    vi.resetModules()
    recency = await import('./recent-agent-messages')
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it.each([
    { age: null, expected: false },
    { age: RECENT_MS - 1, expected: true },
    { age: RECENT_MS, expected: false },
    { age: RECENT_MS + 1, expected: false }
  ])('shows recency for age $age: $expected', async ({ age, expected }) => {
    mocks.rpc.mockResolvedValue({
      latest: age === null ? null : { id: 1, sentAt: Date.now() - age }
    })
    const hook = renderHook(() => recency.useRecentAgentMessages(true))
    await act(async () => {})
    expect(hook.result.current).toBe(expected)
  })

  it('expires without navigation or another metadata reply', async () => {
    mocks.rpc.mockResolvedValue({ latest: { id: 1, sentAt: Date.now() - RECENT_MS + 100 } })
    const hook = renderHook(() => recency.useRecentAgentMessages(true))
    await act(async () => {})
    expect(hook.result.current).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(hook.result.current).toBe(false)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it('persists acknowledgement across module reloads and distinguishes equal timestamps', async () => {
    const latest = { id: 1, sentAt: Date.now() }
    mocks.rpc.mockResolvedValue({ latest })
    const hook = renderHook(() => recency.useRecentAgentMessages(true))
    await act(async () => {})
    expect(hook.result.current).toBe(true)
    act(() => recency.acknowledgeAgentMessages(latest))
    expect(hook.result.current).toBe(false)
    hook.unmount()
    vi.resetModules()
    recency = await import('./recent-agent-messages')
    const reopened = renderHook(() => recency.useRecentAgentMessages(true))
    await act(async () => {})
    expect(reopened.result.current).toBe(false)
    mocks.rpc.mockResolvedValue({ latest: { ...latest, id: 2 } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(reopened.result.current).toBe(true)
    act(() => recency.acknowledgeAgentMessages(latest))
    expect(reopened.result.current).toBe(true)
  })

  it('ignores metadata started before acknowledgement and out-of-order focus replies', async () => {
    const old = pendingReply()
    mocks.rpc.mockReturnValueOnce(old.promise)
    const hook = renderHook(() => recency.useRecentAgentMessages(true))
    const viewed = { id: 2, sentAt: Date.now() }
    act(() => recency.acknowledgeAgentMessages(viewed))
    await act(async () => {
      old.resolve({ latest: { ...viewed, id: 1 } })
    })
    expect(hook.result.current).toBe(false)

    const slow = pendingReply()
    mocks.rpc
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({ latest: { ...viewed, id: 3 } })
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(hook.result.current).toBe(true)
    await act(async () => {
      slow.resolve({ latest: null })
    })
    expect(hook.result.current).toBe(true)
  })

  it('retains recency on metadata failure, expires it, and recovers on focus', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.rpc
      .mockResolvedValueOnce({ latest: { id: 1, sentAt: Date.now() - RECENT_MS + 31_000 } })
      .mockRejectedValue(new Error('offline'))
    const hook = renderHook(() => recency.useRecentAgentMessages(true))
    await act(async () => {})
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(hook.result.current).toBe(true)
    expect(warn).toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(hook.result.current).toBe(false)
    mocks.rpc.mockResolvedValue({ latest: { id: 2, sentAt: Date.now() } })
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(hook.result.current).toBe(true)
  })

  it('parks polling when hidden or disabled and removes listeners on unmount', async () => {
    const hook = renderHook(({ enabled }) => recency.useRecentAgentMessages(enabled), {
      initialProps: { enabled: false }
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
    hook.rerender({ enabled: true })
    await act(async () => {})
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    mocks.visible = false
    hook.rerender({ enabled: true })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
      window.dispatchEvent(new Event('focus'))
    })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    mocks.visible = true
    hook.rerender({ enabled: true })
    await act(async () => {})
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    hook.unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
      window.dispatchEvent(new Event('focus'))
    })
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })

  it('keeps acknowledgement session-local when storage is unavailable', async () => {
    const latest = { id: 1, sentAt: Date.now() }
    mocks.rpc.mockResolvedValue({ latest })
    const hook = renderHook(() => recency.useRecentAgentMessages(true))
    await act(async () => {})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    act(() => recency.acknowledgeAgentMessages(latest))
    expect(hook.result.current).toBe(false)
  })

  it('acknowledges successful page loads and Refresh, but never a failed Refresh', async () => {
    const entry = logEntry()
    let newest = entry
    let failList = false
    mocks.rpc.mockImplementation(async (_target: unknown, method: string) => {
      if (method === 'agentMessageLog.list') {
        if (failList) {
          throw new Error('offline')
        }
        return { entries: [newest], retentionDays: 14 }
      }
      return { latest: { id: newest.id, sentAt: newest.sentAt } }
    })
    const hook = renderHook(() => recency.useRecentAgentMessages(true))
    await act(async () => {})
    expect(hook.result.current).toBe(true)
    const { default: MessagesPage } = await import('./MessagesPage')
    await act(async () => {
      render(<MessagesPage />)
    })
    expect(hook.result.current).toBe(false)
    newest = { ...entry, id: 2, text: 'Another message' }
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(hook.result.current).toBe(true)
    expect(screen.queryByText('Another message')).toBeNull()
    failList = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    })
    expect(hook.result.current).toBe(true)
    failList = false
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    })
    expect(screen.getByText('Another message')).toBeDefined()
    expect(hook.result.current).toBe(false)
  })

  it('does not acknowledge a page load that finishes after the page closes', async () => {
    const latest = { id: 1, sentAt: Date.now() }
    const reply = pendingReply<AgentMessageLogListResult>()
    mocks.rpc.mockResolvedValue({ latest })
    const hook = renderHook(() => recency.useRecentAgentMessages(true))
    await act(async () => {})
    const { default: MessagesPage } = await import('./MessagesPage')
    mocks.rpc.mockReturnValueOnce(reply.promise)
    const page = render(<MessagesPage />)
    page.unmount()
    await act(async () => {
      reply.resolve({ entries: [logEntry()], retentionDays: 14 })
    })
    expect(hook.result.current).toBe(true)
  })

  it('keeps the newest displayed page when StrictMode loads finish out of order', async () => {
    const older = pendingReply<AgentMessageLogListResult>()
    const newer = pendingReply<AgentMessageLogListResult>()
    const { default: MessagesPage } = await import('./MessagesPage')
    mocks.rpc.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    render(
      <StrictMode>
        <MessagesPage />
      </StrictMode>
    )
    await act(async () => {
      newer.resolve({
        entries: [{ ...logEntry(), id: 2, text: 'Newest displayed message' }],
        retentionDays: 14
      })
    })
    await act(async () => {
      older.resolve({ entries: [logEntry()], retentionDays: 14 })
    })
    expect(screen.getByText('Newest displayed message')).toBeDefined()
    expect(screen.queryByText('Please review')).toBeNull()
  })
})
