import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type {
  AgentMessageLogCursor,
  AgentMessageLogLatestResult
} from '../../../../shared/agent-message-log-contract'
import { useWindowStreamVisible } from '@/hooks/use-window-stream-visibility'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'

const ACKNOWLEDGED_KEY = 'orca.messages.acknowledged'
const RECENT_MS = 72 * 60 * 60 * 1000
const POLL_MS = 30_000

type RecencyState = {
  latest: AgentMessageLogCursor | null
  acknowledged: AgentMessageLogCursor | null
}

/** Reads a profile-local acknowledgement; unavailable storage keeps it session-local. */
function readAcknowledged(): AgentMessageLogCursor | null {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(ACKNOWLEDGED_KEY) ?? 'null')
    if (
      typeof value === 'object' &&
      value !== null &&
      'id' in value &&
      typeof value.id === 'number' &&
      Number.isSafeInteger(value.id) &&
      value.id > 0 &&
      'sentAt' in value &&
      typeof value.sentAt === 'number' &&
      Number.isFinite(value.sentAt)
    ) {
      return { id: value.id, sentAt: value.sentAt }
    }
  } catch {
    // Storage may be unavailable; the in-memory acknowledgement still works.
  }
  return null
}

const useRecencyState = create<RecencyState>(() => ({
  latest: null,
  acknowledged: readAcknowledged()
}))
let revision = 0

/** Matches the log's ordering, including sends recorded in the same millisecond. */
function isNewer(cursor: AgentMessageLogCursor, previous: AgentMessageLogCursor | null): boolean {
  return (
    previous === null ||
    cursor.sentAt > previous.sentAt ||
    (cursor.sentAt === previous.sentAt && cursor.id > previous.id)
  )
}

/** Acknowledge only the newest row actually returned by a successful page load. */
export function acknowledgeAgentMessages(latest: AgentMessageLogCursor | undefined): void {
  if (!latest) {
    return
  }
  const cursor = { id: latest.id, sentAt: latest.sentAt }
  revision += 1
  const state = useRecencyState.getState()
  const acknowledged = isNewer(cursor, state.acknowledged) ? cursor : state.acknowledged
  useRecencyState.setState({
    acknowledged,
    latest: isNewer(cursor, state.latest) ? cursor : state.latest
  })
  try {
    window.localStorage.setItem(ACKNOWLEDGED_KEY, JSON.stringify(acknowledged))
  } catch {
    // Keep the acknowledgement for this session if storage is unavailable.
  }
}

/** Tracks unseen messages without fetching their text or refreshing the open list. */
export function useRecentAgentMessages(enabled: boolean): boolean {
  const latest = useRecencyState((state) => state.latest)
  const acknowledged = useRecencyState((state) => state.acknowledged)
  const visible = useWindowStreamVisible(0)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    if (!enabled || !visible) {
      return
    }
    let disposed = false
    async function refresh(): Promise<void> {
      const requestRevision = ++revision
      setNow(Date.now())
      try {
        const result = await callRuntimeRpc<AgentMessageLogLatestResult>(
          { kind: 'local' },
          'agentMessageLog.latest'
        )
        if (!disposed && revision === requestRevision) {
          useRecencyState.setState({ latest: result.latest })
        }
      } catch (error) {
        if (!disposed && revision === requestRevision) {
          console.warn('Failed to check recent messages:', error)
        }
      }
    }
    const onFocus = (): void => void refresh()
    void refresh()
    const interval = window.setInterval(onFocus, POLL_MS)
    window.addEventListener('focus', onFocus)
    return () => {
      disposed = true
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled, visible])

  useEffect(() => {
    if (!enabled || !latest) {
      return
    }
    setNow(Date.now())
    const remaining = latest.sentAt + RECENT_MS - Date.now()
    if (remaining <= 0) {
      return
    }
    const timer = window.setTimeout(() => setNow(Date.now()), remaining)
    return () => window.clearTimeout(timer)
  }, [enabled, latest])

  return (
    enabled && latest !== null && isNewer(latest, acknowledged) && latest.sentAt + RECENT_MS > now
  )
}
