import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../shared/worktree/types'

const expandSidebarGroupsForWorkspace = vi.fn<(target: Worktree | string) => void>()
const prepareAutomationDispatchWorkspace = vi.fn()
const setActiveWorktree = vi.fn()
let settings: Record<string, unknown> = {}

const worktree = { id: 'worktree-1', displayName: 'Nightly triage' } as Worktree

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      settings,
      activeView: 'workspace',
      activeWorktreeId: 'other-worktree',
      activeTabId: null,
      activeTabType: null,
      setActiveView: vi.fn(),
      setActiveWorktree,
      setActiveTab: vi.fn(),
      setActiveTabType: vi.fn()
    })
  }
}))

vi.mock('@/lib/expand-sidebar-groups-for-workspace', () => ({
  expandSidebarGroupsForWorkspace
}))

vi.mock('./automation-dispatch-workspace', () => ({
  prepareAutomationDispatchWorkspace,
  resolveAutomationDispatchWorkspace: () => ({
    repo: { id: 'repo-1' },
    context: {
      workspaceId: 'worktree-1',
      workspaceDisplayName: 'Nightly triage',
      precheckResult: null
    }
  })
}))

vi.mock('./automation-dispatch-completion', () => ({
  createAutomationDispatchCompletion: () => ({
    appendOutput: vi.fn(),
    captureAssistantMessage: vi.fn(),
    handleAgentDone: vi.fn(),
    handleExit: vi.fn(),
    observeAgentStatus: vi.fn(),
    cleanupRunObservers: vi.fn(),
    setReuseDispatchTabRelease: vi.fn(),
    settlePendingAfterDispatch: vi.fn(async () => undefined)
  })
}))

vi.mock('@/lib/launch-agent-background-session', () => ({
  launchAgentBackgroundSession: vi.fn(async () => ({
    tabId: 'tab-1',
    paneKey: 'pane-1',
    ptyId: 'pty-1',
    terminalOwnership: { release: vi.fn(), finalize: vi.fn(() => true) }
  }))
}))

vi.mock('@/lib/agent-paste-draft', () => ({ submitPromptToAgentPty: vi.fn() }))
vi.mock('@/lib/automation-session-observer', () => ({ observeExistingAutomationSession: vi.fn() }))
vi.mock('@/lib/automation-session-reuse', () => ({ findReusableAutomationSession: () => null }))
vi.mock('@/components/automations/automation-host-client', () => ({
  listAutomationRunsForTarget: vi.fn(async () => [])
}))

async function dispatch(): Promise<void> {
  const { handleAutomationDispatchRequest } = await import('./automation-dispatch-handler')
  await handleAutomationDispatchRequest({
    automation: { id: 'automation-1', agentId: 'claude', prompt: 'go', reuseSession: false },
    run: { id: 'run-1', title: 'Nightly triage', workspaceId: 'worktree-1' },
    dispatchToken: 'token-1'
  } as never)
}

describe('automation dispatch sidebar expansion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settings = {}
    prepareAutomationDispatchWorkspace.mockResolvedValue(worktree)
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { api: { automations: { markDispatchResult: vi.fn(async () => undefined) } } }
    })
  })

  it('expands the project holding the run workspace, passing the resolved worktree', async () => {
    await dispatch()

    // The object, not the id: a new_per_run workspace may not be in the store yet.
    expect(expandSidebarGroupsForWorkspace).toHaveBeenCalledWith(worktree)
  })

  it('expands nothing when the setting is off', async () => {
    settings = { expandProjectOnAutomationStart: false }

    await dispatch()

    expect(expandSidebarGroupsForWorkspace).not.toHaveBeenCalled()
  })

  it('expands nothing when the dispatch was skipped before a workspace existed', async () => {
    prepareAutomationDispatchWorkspace.mockResolvedValue(null)

    await dispatch()

    expect(expandSidebarGroupsForWorkspace).not.toHaveBeenCalled()
  })

  it('still dispatches when the expansion throws', async () => {
    // A store shape the sidebar did not expect must not turn a real run into dispatch_failed.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expandSidebarGroupsForWorkspace.mockImplementation(() => {
      throw new Error('collapsedGroups is not iterable')
    })

    await dispatch()

    const { launchAgentBackgroundSession } = await import('@/lib/launch-agent-background-session')
    expect(launchAgentBackgroundSession).toHaveBeenCalledOnce()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('does not navigate to the expanded workspace', async () => {
    await dispatch()

    expect(setActiveWorktree).not.toHaveBeenCalledWith(worktree.id)
  })
})
