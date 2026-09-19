import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type {
  RollingAgentTitleArgs,
  RollingAgentTitleResult
} from '../../../shared/rolling-agent-title'
import type { Tab } from '../../../shared/tab-types'
import { splitWorktreeIdForFilesystem } from '../../../shared/worktree/id'
import { getActiveRuntimeTarget } from '@/runtime/runtime-client-target'
import { getTerminalTabOwnerWorktreeId } from '@/store/slices/terminal-tab-owner-index'
import { getTabIdFromPaneKey } from '@/store/terminals/terminal-pty-identities'
import type { AppState } from '@/store/types'
import { getAgentRowPrimaryText } from './agent-row-primary-text'

/** One generation per tab per window. Bounds a burst of short turns to one CLI spawn. */
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
  const lastAttemptAtByTabId = new Map<string, number>()
  const inFlightTabIds = new Set<string>()
  let stopped = false

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
        ...(candidate.entry.connectionId ? { connectionId: candidate.entry.connectionId } : {}),
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
    }
  }

  const unsubscribe = dependencies.subscribe((state, previous) => {
    if (stopped) {
      return
    }
    if (state.settings?.tabRollingAgentTitle !== true) {
      if (previous.settings?.tabRollingAgentTitle === true) {
        clearAllTitles()
      }
      return
    }
    // Generation goes through window.api, so a remote Orca runtime has no path here.
    if (getActiveRuntimeTarget(state.settings).kind !== 'local') {
      return
    }
    const current = now()
    for (const candidate of collectCompletedTurns(state, previous)) {
      const lastAttemptAt = lastAttemptAtByTabId.get(candidate.tabId)
      if (
        inFlightTabIds.has(candidate.tabId) ||
        (lastAttemptAt !== undefined && current - lastAttemptAt < ROLLING_TITLE_MIN_INTERVAL_MS)
      ) {
        continue
      }
      void runCandidate(candidate)
    }
  })

  return () => {
    stopped = true
    unsubscribe()
  }
}
