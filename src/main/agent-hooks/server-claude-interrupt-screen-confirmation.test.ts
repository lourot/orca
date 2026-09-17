/**
 * Claude reports no hook on a user interrupt, so an Escape on its row arms a watch on the pane's
 * screen and only the interrupt marker appearing settles it. What the marker looks like is pinned
 * by src/main/runtime/claude-interrupt-transcripts.test.ts against captured transcripts; this file
 * covers the arming, the refusals, and what happens when nothing ever confirms.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentInterruptInputIntent } from '../../shared/agent-interrupt-intent'
import type { EnrichedAgentHookEventPayload } from './server/server-types'
import { AgentHookServer, _internals } from './server'
import { PANE } from './server.test-fixtures'

vi.mock('../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../telemetry/cohort-classifier', () => ({
  getCohortAtEmit: vi.fn(() => ({ nth_repo_added: 2 }))
}))

const MARKER = '  ⎿  Interrupted · What should Claude do instead?'
const WORKING_SCREEN: readonly string[] = [
  '⏺ Bash(sleep 120)',
  '  ⎿  Running… (1m 12s · timeout 2m 10s)'
]
const INTERRUPTED_SCREEN: readonly string[] = ['⏺ Bash(sleep 120)', MARKER]
// Longer than CLAUDE_INTERRUPT_SCREEN_CONFIRM_MS, so an expiry case is genuinely past the window.
const PAST_THE_WINDOW_MS = 2_400

/** A repaintable pane screen, so a test can change what the watch sees mid-window. */
type PaneScreen = { lines: readonly string[] | null }

type HookRow = {
  source: string
  hookEventName: string
  state: 'working' | 'waiting' | 'done'
  prompt: string
  agentType: string
  toolName?: string
}

function ingest(server: AgentHookServer, row: HookRow): void {
  const { source, hookEventName, ...payload } = row
  server.ingestRemote(
    { paneKey: PANE, tabId: 'tab-1', worktreeId: 'wt-1', source, hookEventName, payload },
    'conn-1'
  )
}

function pressInterruptKey(server: AgentHookServer, intent: AgentInterruptInputIntent): boolean {
  const row = server.getStatusSnapshotForPane(PANE)[0]
  return server.inferInterrupt({
    paneKey: PANE,
    baselineUpdatedAt: row.receivedAt,
    baselineStateStartedAt: row.stateStartedAt,
    baselinePrompt: row.prompt,
    baselineAgentType: row.agentType,
    intent
  })
}

/** A server on a working Claude row, with a screen the test can repaint. */
function workingClaudePane(screen: PaneScreen): {
  server: AgentHookServer
  published: EnrichedAgentHookEventPayload[]
} {
  const server = new AgentHookServer()
  server.setPaneScreenReader((paneKey) => Promise.resolve(paneKey === PANE ? screen.lines : null))
  ingest(server, {
    source: 'claude',
    hookEventName: 'PreToolUse',
    state: 'working',
    prompt: 'migrate the schema',
    agentType: 'claude',
    toolName: 'Bash'
  })
  const published: EnrichedAgentHookEventPayload[] = []
  server.subscribeEnrichedStatus((payload) => published.push(payload))
  return { server, published }
}

/** The confirmation lands out of band, so wait for the row rather than for a fixed delay. */
async function settledRow(
  server: AgentHookServer
): Promise<ReturnType<AgentHookServer['getStatusSnapshotForPane']>[number]> {
  return vi.waitFor(
    () => {
      const row = server.getStatusSnapshotForPane(PANE)[0]
      expect(row.state).toBe('done')
      return row
    },
    { timeout: PAST_THE_WINDOW_MS, interval: 25 }
  )
}

beforeEach(() => {
  _internals.resetCachesForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Claude escape interrupt, confirmed by the pane screen', () => {
  it('settles the row interrupted once the pane paints the marker', async () => {
    const screen: PaneScreen = { lines: WORKING_SCREEN }
    const { server } = workingClaudePane(screen)

    // Why false: the keypress arms, it does not infer. The row is written by the confirmation.
    expect(pressInterruptKey(server, 'plain-escape')).toBe(false)
    screen.lines = INTERRUPTED_SCREEN

    expect(await settledRow(server)).toMatchObject({ state: 'done', interrupted: true })
  })

  it('leaves the row working when the turn keeps running (#13547)', async () => {
    const screen: PaneScreen = { lines: WORKING_SCREEN }
    const { server, published } = workingClaudePane(screen)

    expect(pressInterruptKey(server, 'plain-escape')).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, PAST_THE_WINDOW_MS))

    expect(server.getStatusSnapshotForPane(PANE)[0]).toMatchObject({ state: 'working' })
    expect(published).toEqual([])
  })

  it('ignores a marker left on screen by an earlier interrupt', async () => {
    // The dangerous shape: Escape closes the slash-command menu on a NEW turn while the previous
    // turn's marker is still visible. Presence alone would settle a running turn.
    const screen: PaneScreen = { lines: INTERRUPTED_SCREEN }
    const { server, published } = workingClaudePane(screen)

    expect(pressInterruptKey(server, 'plain-escape')).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, PAST_THE_WINDOW_MS))

    expect(server.getStatusSnapshotForPane(PANE)[0]).toMatchObject({ state: 'working' })
    expect(published).toEqual([])
  })

  it('refuses when a real hook lands during the window, rather than writing over it', async () => {
    const screen: PaneScreen = { lines: WORKING_SCREEN }
    const { server } = workingClaudePane(screen)

    expect(pressInterruptKey(server, 'plain-escape')).toBe(false)
    ingest(server, {
      source: 'claude',
      hookEventName: 'Stop',
      state: 'done',
      prompt: 'migrate the schema',
      agentType: 'claude'
    })
    screen.lines = INTERRUPTED_SCREEN
    await new Promise((resolve) => setTimeout(resolve, PAST_THE_WINDOW_MS))

    // The hook's own `done` stands, without the inferred `interrupted` flag on top of it.
    expect(server.getStatusSnapshotForPane(PANE)[0]).toMatchObject({ state: 'done' })
    expect(server.getStatusSnapshotForPane(PANE)[0].interrupted).toBeUndefined()
  })

  it('never confirms when no host wired a screen reader', async () => {
    const server = new AgentHookServer()
    ingest(server, {
      source: 'claude',
      hookEventName: 'PreToolUse',
      state: 'working',
      prompt: 'migrate the schema',
      agentType: 'claude',
      toolName: 'Bash'
    })

    expect(pressInterruptKey(server, 'plain-escape')).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, PAST_THE_WINDOW_MS))

    expect(server.getStatusSnapshotForPane(PANE)[0]).toMatchObject({ state: 'working' })
  })

  it('does not arm for the other navigation-escape agents, which have no captured screen', async () => {
    const screen: PaneScreen = { lines: WORKING_SCREEN }
    const server = new AgentHookServer()
    server.setPaneScreenReader(() => Promise.resolve(screen.lines))
    ingest(server, {
      source: 'omp',
      hookEventName: 'PreToolUse',
      state: 'working',
      prompt: 'migrate the schema',
      agentType: 'omp',
      toolName: 'Bash'
    })

    expect(pressInterruptKey(server, 'plain-escape')).toBe(false)
    screen.lines = INTERRUPTED_SCREEN
    await new Promise((resolve) => setTimeout(resolve, PAST_THE_WINDOW_MS))

    expect(server.getStatusSnapshotForPane(PANE)[0]).toMatchObject({ state: 'working' })
  })

  it('still settles Ctrl+C without waiting for any screen', () => {
    const screen: PaneScreen = { lines: WORKING_SCREEN }
    const { server } = workingClaudePane(screen)

    expect(pressInterruptKey(server, 'ctrl-c')).toBe(true)
    expect(server.getStatusSnapshotForPane(PANE)[0]).toMatchObject({
      state: 'done',
      interrupted: true
    })
  })
})
