import { describe, expect, it, vi } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import { getDefaultSettings } from '../../../shared/constants'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import type { RollingAgentTitleResult } from '../../../shared/rolling-agent-title'
import type { Tab } from '../../../shared/tab-types'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import {
  ROLLING_TITLE_MIN_INTERVAL_MS,
  startRollingAgentTitleSync,
  type RollingAgentTitleSyncState
} from './rolling-agent-title-sync'

const WORKTREE_ID = 'repo-1::/repo/wt'
const PANE_KEY = 'tab-1:leaf-1'

/**
 * Drains pending microtasks INCLUDING the in-flight guard's `finally`. Waiting
 * on the write alone leaves the guard set, which would throttle the next turn
 * on its own and hide a broken interval check.
 */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function terminalTab(overrides: Partial<TerminalTab> = {}): TerminalTab {
  return {
    id: 'tab-1',
    ptyId: null,
    worktreeId: WORKTREE_ID,
    title: '✳ Investigate replay bug',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1,
    ...overrides
  }
}

function structuredTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: 'structured-tab-1',
    entityId: 'session-1',
    groupId: 'group-1',
    worktreeId: WORKTREE_ID,
    contentType: 'agent-session',
    label: 'Codex Chat',
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 1,
    agentSessionAgent: 'codex',
    ...overrides
  }
}

function makeHarness(
  args: {
    enabled?: boolean
    activeRuntimeEnvironmentId?: string
    structured?: boolean
    tab?: Partial<TerminalTab>
    generate?: (index: number) => Promise<RollingAgentTitleResult>
  } = {}
) {
  const listeners = new Set<
    (state: RollingAgentTitleSyncState, previous: RollingAgentTitleSyncState) => void
  >()
  const writes: { tabId: string; title: string | null }[] = []
  let clock = 1_000_000
  let generateCalls = 0
  const structuredSession = structuredTab()

  const statusEntry: AgentStatusEntry = {
    state: 'working' as const,
    prompt: 'Make the sidebar label follow the conversation',
    updatedAt: 1,
    stateStartedAt: 1,
    agentType: args.structured ? 'codex' : 'claude',
    paneKey: PANE_KEY,
    tabId: args.structured ? structuredSession.id : 'tab-1',
    worktreeId: WORKTREE_ID,
    stateHistory: []
  }

  let settings: GlobalSettings = {
    ...getDefaultSettings('/tmp'),
    tabRollingAgentTitle: args.enabled !== false,
    ...(args.activeRuntimeEnvironmentId
      ? { activeRuntimeEnvironmentId: args.activeRuntimeEnvironmentId }
      : {})
  }

  let state: RollingAgentTitleSyncState = {
    settings,
    agentStatusByPaneKey: { [PANE_KEY]: statusEntry },
    tabsByWorktree: { [WORKTREE_ID]: args.structured ? [] : [terminalTab(args.tab)] },
    unifiedTabsByWorktree: {
      [WORKTREE_ID]: args.structured ? [structuredSession] : []
    },
    setRollingAgentTitles: (updates: readonly { tabId: string; title: string | null }[]) => {
      writes.push(...updates)
      const previous = state
      state = {
        ...state,
        tabsByWorktree: {
          [WORKTREE_ID]: state.tabsByWorktree[WORKTREE_ID].map((tab: TerminalTab) => {
            const update = updates.find((candidate) => candidate.tabId === tab.id)
            return update ? { ...tab, rollingTitle: update.title } : tab
          })
        },
        unifiedTabsByWorktree: {
          [WORKTREE_ID]: state.unifiedTabsByWorktree[WORKTREE_ID].map((tab: Tab) => {
            const update = updates.find((candidate) => candidate.tabId === tab.id)
            return update ? { ...tab, rollingLabel: update.title } : tab
          })
        }
      }
      notify(previous)
    }
  }

  function notify(previous: RollingAgentTitleSyncState): void {
    for (const listener of listeners) {
      listener(state, previous)
    }
  }

  const generateTitle = vi.fn(async () => {
    generateCalls += 1
    return args.generate
      ? await args.generate(generateCalls)
      : ({ success: true, title: `Rolling ${generateCalls}` } satisfies RollingAgentTitleResult)
  })

  return {
    writes,
    generateTitle,
    advance: (ms: number) => {
      clock += ms
    },
    /** Push the pane into a new `done` turn, as a real status update would. */
    completeTurn: (stateStartedAt = 2) => {
      const previous = state
      state = {
        ...state,
        agentStatusByPaneKey: {
          [PANE_KEY]: {
            ...state.agentStatusByPaneKey[PANE_KEY],
            state: 'done',
            stateStartedAt,
            lastCompletedAssistantMessage: 'Added the resolver tier.'
          }
        }
      }
      notify(previous)
    },
    patchTab: (patch: Partial<TerminalTab> | Partial<Tab>) => {
      const previous = state
      state = {
        ...state,
        tabsByWorktree: {
          [WORKTREE_ID]: args.structured
            ? state.tabsByWorktree[WORKTREE_ID]
            : state.tabsByWorktree[WORKTREE_ID].map((tab: TerminalTab) => ({ ...tab, ...patch }))
        },
        unifiedTabsByWorktree: {
          [WORKTREE_ID]: args.structured
            ? state.unifiedTabsByWorktree[WORKTREE_ID].map((tab: Tab) => ({ ...tab, ...patch }))
            : state.unifiedTabsByWorktree[WORKTREE_ID]
        }
      }
      notify(previous)
    },
    setEnabled: (enabled: boolean) => {
      const previous = state
      settings = { ...settings, tabRollingAgentTitle: enabled }
      state = { ...state, settings }
      notify(previous)
    },
    start: () =>
      startRollingAgentTitleSync({
        getState: () => state,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        generateTitle,
        now: () => clock
      })
  }
}

describe('startRollingAgentTitleSync', () => {
  it('generates a title when a turn finishes and writes it to the tab', async () => {
    const harness = makeHarness()
    harness.start()
    harness.completeTurn()
    await flush()
    expect(harness.generateTitle).toHaveBeenCalledWith({
      worktreePath: '/repo/wt',
      worktreeId: WORKTREE_ID,
      repoId: 'repo-1',
      prompt: 'Make the sidebar label follow the conversation',
      assistantMessage: 'Added the resolver tier.'
    })
    expect(harness.writes).toEqual([{ tabId: 'tab-1', title: 'Rolling 1' }])
  })

  it('generates a rolling label for a native Codex session tab', async () => {
    const harness = makeHarness({ structured: true })
    harness.start()
    harness.completeTurn()
    await flush()
    expect(harness.writes).toEqual([{ tabId: 'structured-tab-1', title: 'Rolling 1' }])
  })

  it('throttles a second turn inside the interval and allows one after it', async () => {
    const harness = makeHarness()
    harness.start()
    harness.completeTurn(2)
    await flush()
    expect(harness.writes).toEqual([{ tabId: 'tab-1', title: 'Rolling 1' }])

    harness.advance(ROLLING_TITLE_MIN_INTERVAL_MS - 1)
    harness.completeTurn(3)
    await flush()
    expect(harness.generateTitle).toHaveBeenCalledTimes(1)

    harness.advance(2)
    harness.completeTurn(4)
    await flush()
    expect(harness.generateTitle).toHaveBeenCalledTimes(2)
  })

  it('throttles after a failure too, so a broken agent config cannot respawn every turn', async () => {
    const harness = makeHarness({
      generate: () => Promise.resolve({ success: false, error: 'no agent configured' })
    })
    harness.start()
    harness.completeTurn(2)
    await flush()
    expect(harness.generateTitle).toHaveBeenCalledTimes(1)

    harness.advance(ROLLING_TITLE_MIN_INTERVAL_MS - 1)
    harness.completeTurn(3)
    await flush()
    expect(harness.generateTitle).toHaveBeenCalledTimes(1)
    expect(harness.writes).toEqual([])
  })

  it('survives a rejected invoke and still throttles, as a stale main bundle does', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const rejections: unknown[] = []
    const onRejection = (event: PromiseRejectionEvent): void => {
      rejections.push(event.reason)
    }
    globalThis.addEventListener?.('unhandledrejection', onRejection)
    const harness = makeHarness({
      generate: () =>
        Promise.reject(new Error("No handler registered for 'agentStatus:generateRollingTitle'"))
    })
    harness.start()
    harness.completeTurn(2)
    await flush()

    harness.advance(ROLLING_TITLE_MIN_INTERVAL_MS - 1)
    harness.completeTurn(3)
    await flush()

    globalThis.removeEventListener?.('unhandledrejection', onRejection)
    expect({
      writes: harness.writes,
      attempts: harness.generateTitle.mock.calls.length,
      unhandled: rejections.length,
      logged: warn.mock.calls.length
    }).toEqual({ writes: [], attempts: 1, unhandled: 0, logged: 1 })
    warn.mockRestore()
  })

  it('never generates for a manually renamed or quick-command tab', async () => {
    const renamed = makeHarness({ tab: { customTitle: 'Payments' } })
    renamed.start()
    renamed.completeTurn()
    const quickCommand = makeHarness({ tab: { quickCommandLabel: 'Run tests' } })
    quickCommand.start()
    quickCommand.completeTurn()
    await flush()
    expect({
      renamed: renamed.generateTitle.mock.calls.length,
      quickCommand: quickCommand.generateTitle.mock.calls.length
    }).toEqual({ renamed: 0, quickCommand: 0 })
  })

  it('discards a result whose tab was renamed during generation', async () => {
    let release: (result: RollingAgentTitleResult) => void = () => {}
    const harness = makeHarness({
      generate: () =>
        new Promise<RollingAgentTitleResult>((resolve) => {
          release = resolve
        })
    })
    harness.start()
    harness.completeTurn()
    expect(harness.generateTitle).toHaveBeenCalledTimes(1)
    harness.patchTab({ customTitle: 'Mine now' })
    release({ success: true, title: 'Rolling 1' })
    await flush()
    expect(harness.writes).toEqual([])
  })

  it('skips generation entirely when the setting is off or the runtime is remote', async () => {
    const disabled = makeHarness({ enabled: false })
    disabled.start()
    disabled.completeTurn()
    const remote = makeHarness({ activeRuntimeEnvironmentId: 'server-1' })
    remote.start()
    remote.completeTurn()
    await flush()
    expect({
      disabled: disabled.generateTitle.mock.calls.length,
      remote: remote.generateTitle.mock.calls.length
    }).toEqual({ disabled: 0, remote: 0 })
  })

  it('retires titles it already wrote when the setting is turned off', async () => {
    const harness = makeHarness()
    harness.start()
    harness.completeTurn()
    await flush()
    harness.setEnabled(false)
    expect(harness.writes).toEqual([
      { tabId: 'tab-1', title: 'Rolling 1' },
      { tabId: 'tab-1', title: null }
    ])
  })

  it('stops generating after the returned disposer runs', async () => {
    const harness = makeHarness()
    const stop = harness.start()
    stop()
    harness.completeTurn()
    await flush()
    expect(harness.generateTitle).not.toHaveBeenCalled()
  })
})
