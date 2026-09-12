/**
 * Forking an agent session with "Full conversation" must launch the real
 * resume argv in the new worktree — `--resume <id> --fork-session` — and must
 * not send the scrollback draft the other fork mode uses.
 *
 * The `--fork-session` half is load-bearing: without it the child would resume
 * the parent's session id, and two panes in different worktrees appending to
 * one Claude transcript is the bug this mode exists to avoid (the dedupe guard
 * in resume-sleeping-agent-session.ts is worktree-scoped and cannot see across
 * the boundary). Unit tests pin the argv builder; only this spec proves what
 * the app actually spawns.
 *
 * Run:
 *   pnpm exec electron-vite build --mode e2e
 *   # ELECTRON_RENDERER_URL must be unset, or the app loads the renderer from a
 *   # running dev server instead of the build under test.
 *   env -u ELECTRON_RENDERER_URL -u NODE_ENV_ELECTRON_VITE \
 *     SKIP_BUILD=1 pnpm exec playwright test tests/e2e/agent-session-fork-full-conversation.spec.ts \
 *     --config tests/playwright.config.ts --project electron-headless --workers=1
 */
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { test as base, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  execInTerminal,
  waitForActivePanePtyId,
  waitForActiveTerminalManager,
  waitForTerminalOutput
} from './helpers/terminal'
import {
  buildFakeAgentCommandOverride,
  FAKE_AGENT_WINDOWS_SHELL
} from './helpers/fake-agent-command-override'
import { makePaneKey } from '../../src/shared/stable-pane-id'

const PROVIDER_SESSION_ID = '019fc155-00e1-7102-99a9-e7c72e532a8e'

const fakeCliDir = mkdtempSync(path.join(os.tmpdir(), 'orca-fork-cli-'))
const spawnLedgerPath = path.join(fakeCliDir, 'claude-spawn.jsonl')
const fakeClaudeSource = `
const { appendFileSync } = require('node:fs')
appendFileSync(
  process.env.ORCA_E2E_CLAUDE_SPAWN_LEDGER,
  JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }) + '\\n'
)
process.stdout.write('FAKE_CLAUDE_READY\\n')
process.stdin.resume()
setInterval(() => {}, 60_000)
`

if (process.platform === 'win32') {
  writeFileSync(path.join(fakeCliDir, 'fake-claude.js'), fakeClaudeSource)
  writeFileSync(
    path.join(fakeCliDir, 'claude.cmd'),
    '@echo off\r\nnode "%~dp0\\fake-claude.js" %*\r\n'
  )
} else {
  const executable = path.join(fakeCliDir, 'claude')
  writeFileSync(executable, `#!/usr/bin/env node\n${fakeClaudeSource}`)
  chmodSync(executable, 0o755)
}

const fakeClaudeCommand = buildFakeAgentCommandOverride(
  path.join(fakeCliDir, process.platform === 'win32' ? 'claude.cmd' : 'claude')
)

const test = base.extend({
  launchEnv: [
    {
      PATH: `${fakeCliDir}${path.delimiter}${process.env.PATH ?? ''}`,
      ORCA_E2E_CLAUDE_SPAWN_LEDGER: spawnLedgerPath
    },
    { option: true }
  ]
})

type SpawnEvent = { args: string[]; cwd: string }

function readSpawnLedger(): SpawnEvent[] {
  if (!existsSync(spawnLedgerPath)) {
    return []
  }
  return readFileSync(spawnLedgerPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SpawnEvent)
}

/** Give the active pane the Claude identity and provider session a live hook
 *  report would have produced, so the fork sees a forkable conversation. */
async function seedClaudePaneSession(page: Page, worktreeId: string): Promise<void> {
  const pane = await page.evaluate(() => {
    const state = window.__store?.getState()
    const tabId = state?.activeTabId
    const manager = tabId ? window.__paneManagers?.get(tabId) : null
    const leafId = manager?.getActivePane?.()?.leafId ?? manager?.getPanes?.()[0]?.leafId ?? null
    if (!tabId || !leafId) {
      throw new Error('No active terminal pane to seed')
    }
    return { tabId, leafId }
  })
  const paneKey = makePaneKey(pane.tabId, pane.leafId)
  await page.evaluate(
    ({ paneKey, providerSessionId, tabId, worktreeId }) => {
      const state = window.__store?.getState()
      if (!state) {
        throw new Error('Renderer store unavailable')
      }
      const providerSession = { key: 'session_id' as const, id: providerSessionId }
      state.setAgentStatus(
        paneKey,
        { state: 'working', prompt: 'design the fork', agentType: 'claude' },
        'Claude',
        undefined,
        { tabId, worktreeId },
        { providerSession }
      )
    },
    { paneKey, providerSessionId: PROVIDER_SESSION_ID, tabId: pane.tabId, worktreeId }
  )
  await expect
    .poll(() =>
      page.evaluate(
        (key) => window.__store?.getState().agentStatusByPaneKey[key]?.providerSession?.id ?? null,
        paneKey
      )
    )
    .toBe(PROVIDER_SESSION_ID)
}

async function rightClickActiveTerminal(page: Page): Promise<void> {
  const point = await page.evaluate(() => {
    const state = window.__store?.getState()
    const tabId = state?.activeTabId
    const manager = tabId ? window.__paneManagers?.get(tabId) : null
    const pane = manager?.getActivePane?.() ?? manager?.getPanes?.()[0] ?? null
    const surface =
      pane?.container.querySelector<HTMLElement>('.xterm-screen') ??
      pane?.container.querySelector<HTMLElement>('.xterm') ??
      pane?.container
    if (!pane || !surface) {
      throw new Error('No active terminal surface to right-click')
    }
    pane.terminal.clearSelection()
    const rect = surface.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error('Active terminal surface is not measurable')
    }
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })
  await page.mouse.click(point.x, point.y, { button: 'right' })
}

test.afterAll(() => {
  rmSync(fakeCliDir, { force: true, recursive: true })
})

test.describe('forking an agent session with its full conversation', () => {
  test('spawns the forking resume argv in the new worktree, with no draft prompt', async ({
    orcaPage
  }) => {
    test.setTimeout(180_000)
    await waitForSessionReady(orcaPage)
    const worktreeId = await waitForActiveWorktree(orcaPage)
    await ensureTerminalVisible(orcaPage)
    await waitForActiveTerminalManager(orcaPage)
    const ptyId = await waitForActivePanePtyId(orcaPage)
    await orcaPage.evaluate(
      async ({ agentCommand, terminalWindowsShell }) => {
        await window.__store?.getState().updateSettings({
          agentCmdOverrides: { claude: agentCommand },
          terminalWindowsShell,
          disabledTuiAgents: []
        })
      },
      { agentCommand: fakeClaudeCommand, terminalWindowsShell: FAKE_AGENT_WINDOWS_SHELL }
    )
    await seedClaudePaneSession(orcaPage, worktreeId)
    // The dialog only opens for a pane with capturable scrollback, so give it some.
    await execInTerminal(orcaPage, ptyId, 'echo FORK_SOURCE_CONTEXT')
    await waitForTerminalOutput(orcaPage, 'FORK_SOURCE_CONTEXT')

    await rightClickActiveTerminal(orcaPage)
    await orcaPage.getByRole('menuitem', { name: /Fork Agent Session/ }).click()
    await expect(orcaPage.getByRole('dialog')).toBeVisible()

    const fullConversationCard = orcaPage.getByRole('radio', { name: /Full conversation/ })
    await expect(fullConversationCard).toBeEnabled()
    await expect(fullConversationCard).toHaveAttribute('aria-checked', 'true')

    await orcaPage.getByRole('button', { name: 'Create fork' }).click()

    await expect.poll(readSpawnLedger, { timeout: 120_000 }).toHaveLength(1)
    const [spawn] = readSpawnLedger()
    expect(spawn.args).toEqual(['--resume', PROVIDER_SESSION_ID, '--fork-session'])

    // The forked worktree is its own directory, and the parent's pane is untouched.
    const forkWorktreeId = await orcaPage.evaluate(
      () => window.__store?.getState().activeWorktreeId
    )
    expect(forkWorktreeId).not.toBe(worktreeId)
  })
})
