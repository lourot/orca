import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockLaunchAgentInStructuredNewTab = vi.fn()
const mockQueueTabStartupCommand = vi.fn()

const agentDefaultArgs: Record<string, string> = {}

const store = {
  settings: {
    agentCmdOverrides: {},
    agentDefaultArgs,
    agentDefaultEnv: {},
    activeRuntimeEnvironmentId: null
  },
  repos: [],
  allWorktrees: vi.fn(() => []),
  tabsByWorktree: { 'wt-1': [{ id: 'tab-1' }] },
  openFiles: [],
  browserTabsByWorktree: {},
  tabBarOrderByWorktree: {},
  createTab: vi.fn(() => ({ id: 'tab-1' })),
  queueTabInitialCwd: vi.fn(),
  queueTabStartupCommand: mockQueueTabStartupCommand,
  setActiveTabType: vi.fn(),
  setTabBarOrder: vi.fn()
}

vi.mock('@/store', () => ({
  useAppStore: { getState: () => store }
}))

vi.mock('@/lib/new-workspace', () => ({ CLIENT_PLATFORM: 'darwin' }))

vi.mock('@/lib/connection-context', () => ({
  getConnectionIdFromState: () => null
}))

vi.mock('@/lib/native-chat-transcript-readability', () => ({
  isNativeChatTranscriptLocalReadable: () => true
}))

vi.mock('@/runtime/web-runtime-session', () => ({
  isWebRuntimeSessionActive: () => false
}))

vi.mock('@/lib/worktree-runtime-owner', () => ({
  getExecutionHostIdForWorktree: () => 'local',
  getRuntimeEnvironmentIdForWorktree: () => null
}))

vi.mock('@/lib/launch-agent-in-new-tab-structured', () => ({
  launchAgentInStructuredNewTab: mockLaunchAgentInStructuredNewTab
}))

vi.mock('@/components/tab-bar/reconcile-order', () => ({
  reconcileTabOrder: (_stored: unknown, terminalIds: string[]) => terminalIds
}))

vi.mock('@/lib/telemetry', () => ({
  track: vi.fn(),
  tuiAgentToAgentKind: (agent: string) => agent
}))

vi.mock('@/components/native-chat/native-chat-session-option-cache', () => ({
  seedNativeChatAppliedSessionOptions: vi.fn()
}))

import { adoptAgentSessionLaunchVerdict } from './agent-session-launch-plan'

const structuredPlan = () =>
  adoptAgentSessionLaunchVerdict({
    route: 'structured-native-chat',
    agent: 'claude',
    worktreeId: 'wt-1',
    prompt: 'fork context',
    promptDelivery: 'draft'
  })

describe('launchAgentInNewTab argv routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store.settings.agentDefaultArgs = {}
    mockLaunchAgentInStructuredNewTab.mockReturnValue({
      tabId: 'agent-session:session-1',
      sessionId: 'session-1',
      structuredSettlement: Promise.resolve({ kind: 'structured', sessionId: 'session-1' })
    })
  })

  it('keeps an argv-carrying launch on the terminal path even with a structured plan', async () => {
    const { launchAgentInNewTab } = await import('./launch-agent-in-new-tab')

    const result = launchAgentInNewTab({
      agent: 'claude',
      worktreeId: 'wt-1',
      agentArgs: '--resume abc123 --fork-session',
      agentSessionLaunchPlan: structuredPlan()
    })

    // The structured route launches through the provider API and drops argv.
    expect(mockLaunchAgentInStructuredNewTab).not.toHaveBeenCalled()
    expect(result?.surface).toEqual({ kind: 'local-terminal', tabId: 'tab-1' })
    expect(mockQueueTabStartupCommand).toHaveBeenCalledWith(
      'tab-1',
      expect.objectContaining({ agentArgsOverride: '--resume abc123 --fork-session' })
    )
  })

  it('takes the structured plan when the caller passes no argv', async () => {
    const { launchAgentInNewTab } = await import('./launch-agent-in-new-tab')

    const result = launchAgentInNewTab({
      agent: 'claude',
      worktreeId: 'wt-1',
      prompt: 'fork context',
      promptDelivery: 'draft',
      agentSessionLaunchPlan: structuredPlan()
    })

    expect(mockLaunchAgentInStructuredNewTab).toHaveBeenCalledTimes(1)
    expect(result?.surface).toEqual({
      kind: 'local-agent-session',
      tabId: 'agent-session:session-1',
      sessionId: 'session-1'
    })
  })

  it('lets settings-derived default args reach the structured route', async () => {
    // Only the caller's own agentArgs may bypass native chat; a user's default
    // args must not silently disable it for every launch.
    store.settings.agentDefaultArgs = { claude: '--verbose' }
    const { launchAgentInNewTab } = await import('./launch-agent-in-new-tab')

    launchAgentInNewTab({
      agent: 'claude',
      worktreeId: 'wt-1',
      agentSessionLaunchPlan: structuredPlan()
    })

    expect(mockLaunchAgentInStructuredNewTab).toHaveBeenCalledTimes(1)
  })
})
