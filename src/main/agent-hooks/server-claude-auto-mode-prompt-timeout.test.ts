import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentHookServer, _internals } from './server'
import { CLAUDE_AUTO_MODE_PROMPT_TIMEOUT_MS } from './server/server-claude-status-rules'
import { buildBody, PANE } from './server.test-fixtures'

vi.mock('../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../telemetry/cohort-classifier', () => ({
  getCohortAtEmit: () => ({ nth_repo_added: 2 })
}))

const START = 1_800_000_000_000
let now = START

beforeEach(() => {
  _internals.resetCachesForTests()
  now = START
  vi.spyOn(Date, 'now').mockImplementation(() => now)
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function withClaudeHookServer(
  run: (
    post: (payload: Record<string, unknown>) => Promise<void>,
    server: AgentHookServer
  ) => Promise<void>
): Promise<void> {
  const server = new AgentHookServer()
  await server.start({ env: 'production' })
  try {
    const env = server.buildPtyEnv()
    await run(async (payload) => {
      const response = await fetch(`http://127.0.0.1:${env.ORCA_AGENT_HOOK_PORT}/hook/claude`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Orca-Agent-Hook-Token': env.ORCA_AGENT_HOOK_TOKEN
        },
        body: JSON.stringify(buildBody(payload))
      })
      expect(response.status).toBe(204)
    }, server)
  } finally {
    server.stop()
  }
}

const DENIED = { command: 'X=("${(@f)$(ls)}"); rm -f "${X[1]}"' }
const NEXT = { command: 'pnpm test' }

/** Replays a safety-check prompt that times out unanswered, then the lead's next tool. */
async function replayPromptThenNextTool(
  post: (payload: Record<string, unknown>) => Promise<void>,
  permissionMode: string,
  elapsedMs: number
): Promise<void> {
  await post({ hook_event_name: 'UserPromptSubmit', prompt: 'lint and test' })
  await post({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: DENIED,
    tool_use_id: 'toolu-denied'
  })
  await post({
    hook_event_name: 'PermissionRequest',
    permission_mode: permissionMode,
    tool_name: 'Bash',
    tool_input: DENIED
  })
  now += elapsedMs
  await post({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: NEXT,
    tool_use_id: 'toolu-next'
  })
}

describe('Claude auto-mode permission prompt that times out without a hook', () => {
  it('releases the wait on the next tool once the auto-mode prompt has timed out', async () => {
    await withClaudeHookServer(async (post, server) => {
      await replayPromptThenNextTool(post, 'auto', CLAUDE_AUTO_MODE_PROMPT_TIMEOUT_MS)
      expect(server.getStatusSnapshot()[0]).toMatchObject({ paneKey: PANE, state: 'working' })
    })
  })

  it('keeps the auto-mode wait while its prompt can still be open', async () => {
    await withClaudeHookServer(async (post, server) => {
      await replayPromptThenNextTool(post, 'auto', CLAUDE_AUTO_MODE_PROMPT_TIMEOUT_MS - 1_000)
      expect(server.getStatusSnapshot()[0]).toMatchObject({ state: 'waiting', toolName: 'Bash' })
    })
  })

  it('keeps a default-mode wait however long it has been open', async () => {
    await withClaudeHookServer(async (post, server) => {
      await replayPromptThenNextTool(post, 'default', 10 * CLAUDE_AUTO_MODE_PROMPT_TIMEOUT_MS)
      expect(server.getStatusSnapshot()[0]).toMatchObject({ state: 'waiting', toolName: 'Bash' })
    })
  })

  it('releases a remote auto-mode wait once its prompt has timed out', () => {
    const server = new AgentHookServer()
    const remote = (state: 'waiting' | 'working', fields: Record<string, unknown>): void =>
      server.ingestRemote(
        {
          paneKey: PANE,
          tabId: 'tab-1',
          worktreeId: 'wt-1',
          source: 'claude',
          ...fields,
          payload: { state, prompt: '', agentType: 'claude', toolName: 'Bash' }
        },
        'conn-1'
      )
    remote('waiting', { hookEventName: 'PermissionRequest', claudePromptTimesOut: true })
    expect(server.getStatusSnapshot()[0]).toMatchObject({ state: 'waiting' })
    now += CLAUDE_AUTO_MODE_PROMPT_TIMEOUT_MS
    remote('working', { hookEventName: 'PreToolUse', toolUseId: 'toolu-next' })
    expect(server.getStatusSnapshot()[0]).toMatchObject({ state: 'working' })
  })
})
