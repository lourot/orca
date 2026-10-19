import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type {
  RollingAgentTitleArgs,
  RollingAgentTitleResult
} from '../../../shared/rolling-agent-title'
import type { Tab } from '../../../shared/tab-types'
import { splitWorktreeIdForFilesystem } from '../../../shared/worktree/id'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { resolveOwner } from '@/lib/resolve-owner'
import { getTerminalTabOwnerWorktreeId } from '@/store/slices/terminal-tab-owner-index'
import { getTabIdFromPaneKey } from '@/store/terminals/terminal-pty-identities'
import type { AppState } from '@/store/types'
import { getAgentRowPrimaryText } from '../../../shared/agent-row-primary-text'

/** One generation per tab per window; a turn inside it is titled when the window ends. */
export const ROLLING_TITLE_MIN_INTERVAL_MS = 2 * 60_000

/** Everything this module reads, so the store surface it depends on is explicit. */
export type RollingAgentTitleSyncState = Pick<
  AppState,
  | 'settings'
  | 'agentStatusByPaneKey'
  | 'tabsByWorktree'
  | 'unifiedTabsByWorktree'
  | 'setRollingAgentTitles'
>

type RollingAgentTitleSyncDependencies = {
  getState: () => RollingAgentTitleSyncState
  subscribe: (
    listener: (state: RollingAgentTitleSyncState, previous: RollingAgentTitleSyncState) => void
  ) => () => void
  generateTitle: (args: RollingAgentTitleArgs) => Promise<RollingAgentTitleResult>
  now?: () => number
  /** Runs `fn` after `ms`; returns a canceller. */
  schedule?: (fn: () => void, ms: number) => () => void
}

function scheduleWithTimeout(fn: () => void, ms: number): () => void {
  const timer = setTimeout(fn, ms)
  return () => clearTimeout(timer)
}

type TurnCandidate = { tabId: string; entry: AgentStatusEntry }

/** A `done` that ends a real turn, not a session boundary, and is new since `previous`. */
function isFreshCompletedTurn(
  entry: AgentStatusEntry,
  previous: AgentStatusEntry | undefined
): boolean {
  if (entry.state !== 'done' || entry.sessionBoundary === true) {
    return false
  }
  return previous?.state !== 'done' || previous.stateStartedAt !== entry.stateStartedAt
}

function collectCompletedTurns(
  state: RollingAgentTitleSyncState,
  previous: RollingAgentTitleSyncState
): TurnCandidate[] {
  const candidates: TurnCandidate[] = []
  for (const [paneKey, entry] of Object.entries(state.agentStatusByPaneKey)) {
    if (!isFreshCompletedTurn(entry, previous.agentStatusByPaneKey[paneKey])) {
      continue
    }
    const tabId = entry.tabId ?? getTabIdFromPaneKey(paneKey)
    if (tabId) {
      candidates.push({ tabId, entry })
    }
  }
  return candidates
}

function findRollingTitleTab(
  state: RollingAgentTitleSyncState,
  tabId: string
): { worktreeId: string; hasManualTitle: boolean } | null {
  const worktreeId = getTerminalTabOwnerWorktreeId(state.tabsByWorktree, tabId)
  if (worktreeId) {
    const tab = state.tabsByWorktree[worktreeId]?.find((candidate) => candidate.id === tabId)
    if (tab) {
      return {
        worktreeId,
        hasManualTitle: Boolean(tab.customTitle?.trim() || tab.quickCommandLabel?.trim())
      }
    }
  }

  for (const [unifiedWorktreeId, tabs] of Object.entries(state.unifiedTabsByWorktree)) {
    const tab = tabs.find(
      (candidate: Tab) => candidate.contentType === 'agent-session' && candidate.id === tabId
    )
    if (tab) {
      return {
        worktreeId: unifiedWorktreeId,
        hasManualTitle: Boolean(tab.customLabel?.trim() || tab.quickCommandLabel?.trim())
      }
    }
  }

  return null
}

/**
 * Regenerates an agent tab's title from each finished turn, so the sidebar row
 * and the tab strip say what the session is doing now rather than what it was
 * first asked. Dependencies are injected so this unit-tests without React.
 */
export function startRollingAgentTitleSync(
  dependencies: RollingAgentTitleSyncDependencies
): () => void {
  const now = dependencies.now ?? Date.now
  const schedule = dependencies.schedule ?? scheduleWithTimeout
  const lastAttemptAtByTabId = new Map<string, number>()
  const inFlightTabIds = new Set<string>()
  // Why: a turn inside the throttle window is deferred, not dropped, so a burst
  // ends titled by its last turn. Latest wins; one timer per tab.
  const pendingByTabId = new Map<string, TurnCandidate>()
  const cancelTimerByTabId = new Map<string, () => void>()
  let stopped = false

  const isThrottled = (tabId: string): boolean => {
    const lastAttemptAt = lastAttemptAtByTabId.get(tabId)
    return (
      inFlightTabIds.has(tabId) ||
      (lastAttemptAt !== undefined && now() - lastAttemptAt < ROLLING_TITLE_MIN_INTERVAL_MS)
    )
  }

  const cancelDeferred = (tabId: string): void => {
    cancelTimerByTabId.get(tabId)?.()
    cancelTimerByTabId.delete(tabId)
    pendingByTabId.delete(tabId)
  }

  const cancelAllDeferred = (): void => {
    for (const tabId of [...pendingByTabId.keys(), ...cancelTimerByTabId.keys()]) {
      cancelDeferred(tabId)
    }
  }

  /** Arms the tab's timer for the end of its window; an in-flight run picks up instead. */
  const scheduleDeferred = (tabId: string): void => {
    if (cancelTimerByTabId.has(tabId) || inFlightTabIds.has(tabId)) {
      return
    }
    const lastAttemptAt = lastAttemptAtByTabId.get(tabId) ?? now()
    const delay = Math.max(0, lastAttemptAt + ROLLING_TITLE_MIN_INTERVAL_MS - now())
    cancelTimerByTabId.set(
      tabId,
      schedule(() => {
        cancelTimerByTabId.delete(tabId)
        runPending(tabId)
      }, delay)
    )
  }

  const runPending = (tabId: string): void => {
    const pending = pendingByTabId.get(tabId)
    if (stopped || !pending) {
      return
    }
    if (isThrottled(tabId)) {
      scheduleDeferred(tabId)
      return
    }
    pendingByTabId.delete(tabId)
    void runCandidate(pending)
  }

  const clearAllTitles = (): void => {
    const state = dependencies.getState()
    const updates = [
      ...Object.values(state.tabsByWorktree)
        .flat()
        .filter((tab) => tab.rollingTitle)
        .map((tab) => ({ tabId: tab.id, title: null })),
      ...Object.values(state.unifiedTabsByWorktree)
        .flat()
        .filter((tab) => tab.contentType === 'agent-session' && tab.rollingLabel)
        .map((tab) => ({ tabId: tab.id, title: null }))
    ]
    if (updates.length > 0) {
      state.setRollingAgentTitles(updates)
    }
  }

  const runCandidate = async (candidate: TurnCandidate): Promise<void> => {
    const state = dependencies.getState()
    const tab = findRollingTitleTab(state, candidate.tabId)
    if (!tab || tab.hasManualTitle) {
      return
    }
    // Generation spawns its agent through this desktop's window.api, so only local workspaces qualify.
    const owner = resolveOwner(state, { workspaceId: tab.worktreeId })
    if (
      candidate.entry.connectionId ||
      (owner.kind === 'resolved' &&
        (owner.owner.endpoint.kind !== 'self' || owner.owner.at !== LOCAL_EXECUTION_HOST_ID))
    ) {
      return
    }
    const parsed = splitWorktreeIdForFilesystem(tab.worktreeId)
    const prompt = getAgentRowPrimaryText(candidate.entry).trim()
    if (!parsed?.worktreePath || !prompt) {
      return
    }
    // Recorded BEFORE the await so a failure throttles too - otherwise a broken
    // agent config would re-spawn the CLI on every turn.
    lastAttemptAtByTabId.set(candidate.tabId, now())
    inFlightTabIds.add(candidate.tabId)
    try {
      const result = await dependencies.generateTitle({
        worktreePath: parsed.worktreePath,
        worktreeId: tab.worktreeId,
        repoId: parsed.repoId,
        prompt,
        ...(candidate.entry.lastCompletedAssistantMessage
          ? { assistantMessage: candidate.entry.lastCompletedAssistantMessage }
          : {})
      })
      if (stopped || !result.success) {
        return
      }
      // Generation can outlive a rename or a tab close.
      const latest = dependencies.getState()
      const stillWritable = findRollingTitleTab(latest, candidate.tabId)
      if (stillWritable && !stillWritable.hasManualTitle) {
        latest.setRollingAgentTitles([{ tabId: candidate.tabId, title: result.title }])
      }
    } catch (error) {
      // ipcRenderer.invoke REJECTS for an unregistered channel (stale main
      // bundle) or a throwing handler, so this is not just the failure result
      // path. A title is a convenience: log and drop it. The throttle stamp is
      // already set, so a persistent rejection cannot spin.
      console.warn('[rolling-agent-title] generation failed', error)
    } finally {
      inFlightTabIds.delete(candidate.tabId)
      runPending(candidate.tabId)
    }
  }

  const unsubscribe = dependencies.subscribe((state, previous) => {
    if (stopped) {
      return
    }
    if (state.settings?.tabRollingAgentTitle !== true) {
      if (previous.settings?.tabRollingAgentTitle === true) {
        cancelAllDeferred()
        clearAllTitles()
      }
      return
    }
    for (const candidate of collectCompletedTurns(state, previous)) {
      if (isThrottled(candidate.tabId)) {
        pendingByTabId.set(candidate.tabId, candidate)
        scheduleDeferred(candidate.tabId)
        continue
      }
      cancelDeferred(candidate.tabId)
      void runCandidate(candidate)
    }
  })

  return () => {
    stopped = true
    cancelAllDeferred()
    unsubscribe()
  }
}
