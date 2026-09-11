/**
 * A run dispatched into a collapsed project must open the project that holds it,
 * and must not navigate there.
 *
 * E2E rather than a unit test because the group keys and the rendered headers come
 * from the same state by different paths. Only the real sidebar proves they agree.
 */

import { test, expect } from './helpers/orca-app'
import { getActiveWorktreeId, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test('a run opens the collapsed project holding its workspace, without navigating', async ({
  orcaPage,
  electronApp
}) => {
  await waitForSessionReady(orcaPage)
  const activeWorktreeId = await waitForActiveWorktree(orcaPage)

  const target = await orcaPage.evaluate((activeId) => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
    const worktree = Object.values(store.getState().worktreesByRepo)
      .flat()
      .find((candidate) => candidate.id !== activeId)
    return worktree ? { worktreeId: worktree.id, repoId: worktree.repoId } : null
  }, activeWorktreeId)

  test.skip(!target, 'needs the seeded secondary worktree so the run target is not already active')
  if (!target) {
    return
  }

  const sidebar = orcaPage.locator('[data-worktree-sidebar]')
  const targetRow = sidebar.locator(`[data-worktree-id="${target.worktreeId}"]`)
  await expect(targetRow).toBeVisible()

  // Collapse every project header the way the sidebar itself persists it.
  await orcaPage.evaluate(async () => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
    store.getState().setGroupBy('repo')
    const collapsedGroups = store
      .getState()
      .projectHostSetups.map((setup) => `project:${setup.projectId}`)
    await window.api.ui.set({ groupBy: 'repo', collapsedGroups })
    store.setState({ collapsedGroups: new Set(collapsedGroups) })
  })
  await expect(targetRow).toBeHidden()

  // The renderer's real entry point. The agent launch that follows will fail in
  // the E2E profile, and that is fine: the expansion happens before it.
  await electronApp.evaluate(({ BrowserWindow }, request) => {
    const [window] = BrowserWindow.getAllWindows()
    if (!window) {
      throw new Error('No Orca window to dispatch into')
    }
    window.webContents.send('automations:dispatchRequested', request)
  }, buildDispatchRequest(target))

  await expect(targetRow).toBeVisible()
  expect(await getActiveWorktreeId(orcaPage)).toBe(activeWorktreeId)
})

function buildDispatchRequest({ worktreeId, repoId }: { worktreeId: string; repoId: string }) {
  return {
    automation: {
      id: 'e2e-expand-automation',
      name: 'Expand the project on run start',
      prompt: 'noop',
      agentId: 'claude',
      projectId: repoId,
      workspaceMode: 'existing',
      workspaceId: worktreeId,
      baseBranch: null,
      reuseSession: false,
      timezone: 'UTC',
      rrule: 'FREQ=YEARLY',
      dtstart: 4102444800000,
      enabled: false,
      nextRunAt: 4102444800000,
      missedRunPolicy: 'skip',
      missedRunGraceMinutes: 0,
      createdAt: 1,
      updatedAt: 1
    },
    run: {
      id: 'e2e-expand-run',
      automationId: 'e2e-expand-automation',
      title: 'Expand the project on run start',
      scheduledFor: 1,
      status: 'dispatching',
      trigger: 'manual',
      workspaceId: worktreeId,
      sessionKind: 'terminal',
      chatSessionId: null,
      terminalSessionId: null,
      terminalPaneKey: null,
      terminalPtyId: null,
      outputSnapshot: null,
      precheckResult: null,
      usage: null,
      error: null,
      startedAt: null,
      dispatchedAt: null,
      createdAt: 1
    },
    dispatchToken: 'e2e-expand-token'
  }
}
