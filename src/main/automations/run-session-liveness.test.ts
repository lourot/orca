// The skip-if-open probe against a real runtime: a fake one hid that desktop tabs read as closed.
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { AutomationRun } from '../../shared/automations-types'
import { isRunSessionLive } from './automation-run-guards'

const { OrcaRuntimeService } = await import('../runtime/orca-runtime-test-mocks.spec')
await import('../runtime/orca-runtime-test-lifecycle.spec')
const { TEST_WORKTREE_ID, TEST_WORKTREE_PATH, store } =
  await import('../runtime/orca-runtime-test-fixtures.spec')

const RUN_PTY = `${TEST_WORKTREE_ID}@@run`
const OTHER_PTY = `${TEST_WORKTREE_ID}@@other`

/** A desktop window showing `panePtyId` in one tab, as the renderer publishes it. */
async function desktopWithPane(panePtyId: string) {
  const tabId = randomUUID()
  const leafId = randomUUID()
  const runtime = new OrcaRuntimeService(store)
  runtime.setPtyController({
    write: () => true,
    kill: () => false,
    stopAndWait: async () => false,
    getForegroundProcess: async () => null,
    listProcesses: async () => [
      { id: panePtyId, cwd: TEST_WORKTREE_PATH, title: 'claude', worktreeId: TEST_WORKTREE_ID }
    ]
  })
  runtime.attachWindow(1)
  await runtime.listTerminals()
  runtime.syncWindowGraph(1, {
    tabs: [
      { tabId, worktreeId: TEST_WORKTREE_ID, title: 'Claude', activeLeafId: leafId, layout: null }
    ],
    leaves: [{ tabId, worktreeId: TEST_WORKTREE_ID, leafId, paneRuntimeId: 1, ptyId: panePtyId }]
  })
  return { runtime, paneKey: `${tabId}:${leafId}` }
}

function runIn(paneKey: string): Pick<AutomationRun, 'terminalPaneKey' | 'terminalPtyId'> {
  return { terminalPaneKey: paneKey, terminalPtyId: RUN_PTY }
}

describe('isRunSessionLive', () => {
  it('reads a desktop tab still holding the run PTY as open', async () => {
    const { runtime, paneKey } = await desktopWithPane(RUN_PTY)

    expect(isRunSessionLive(runtime, runIn(paneKey))).toBe(true)
  })

  it('reads a pane another session took over as closed', async () => {
    const { runtime, paneKey } = await desktopWithPane(OTHER_PTY)

    expect(isRunSessionLive(runtime, runIn(paneKey))).toBe(false)
  })

  it('reads the pane as closed once its PTY exits', async () => {
    const { runtime, paneKey } = await desktopWithPane(RUN_PTY)

    await runtime.onPtyExit(RUN_PTY, 0)

    expect(isRunSessionLive(runtime, runIn(paneKey))).toBe(false)
  })
})
