import { test, expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test('groups sleeping workspaces without changing status or allowing drags', async ({
  orcaPage,
  electronApp
}, testInfo) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(2200, 1000)
  })
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  const ids = await orcaPage.evaluate(() => {
    const store = window.__store
    if (!store) {
      throw new Error('Store unavailable')
    }
    const state = store.getState()
    const repo = state.repos[0]
    const original = repo && state.worktreesByRepo[repo.id]?.[0]
    if (!repo || !original) {
      throw new Error('Seeded workspace unavailable')
    }
    const sleeping = {
      ...original,
      id: `${repo.id}::/board-sleeping`,
      path: '/board-sleeping',
      displayName: 'Sleeping example',
      isMainWorktree: false,
      workspaceStatus: 'in-review'
    }
    const awake = {
      ...original,
      id: `${repo.id}::/board-awake`,
      path: '/board-awake',
      displayName: 'Awake example',
      isMainWorktree: false,
      workspaceStatus: 'todo'
    }
    state.setSidebarOpen(true)
    state.setShowSleepingWorkspaces(true)
    state.setFilterRepoIds([])
    state.setHideDefaultBranchWorkspace(false)
    state.setWorkspaceStatuses([
      { id: 'todo', label: 'Todo' },
      { id: 'in-progress', label: 'In progress' },
      { id: 'in-review', label: 'In review' },
      { id: 'completed', label: 'Done' }
    ])
    store.setState({
      worktreesByRepo: { ...state.worktreesByRepo, [repo.id]: [original, sleeping, awake] },
      tabsByWorktree: {
        ...state.tabsByWorktree,
        [awake.id]: [
          {
            id: 'board-awake-tab',
            worktreeId: awake.id,
            ptyId: 'board-awake-pty',
            title: 'Shell',
            customTitle: null,
            color: null,
            isPinned: false,
            sortOrder: 0,
            createdAt: 0
          }
        ]
      },
      ptyIdsByTabId: { ...state.ptyIdsByTabId, 'board-awake-tab': ['board-awake-pty'] }
    })
    return { sleeping: sleeping.id, awake: awake.id, repo: repo.id }
  })
  await orcaPage.getByRole('button', { name: 'Workspace board' }).click()
  const board = orcaPage.locator('[data-workspace-board-selection-surface]')
  const sleepingLane = board.locator('[data-workspace-board-sleeping-lane]')
  const sleepingCard = sleepingLane.locator(`[data-workspace-board-worktree-id="${ids.sleeping}"]`)
  await expect(sleepingCard).toBeVisible()
  const scroller = board.locator('[data-workspace-board-lane-grid]').locator('..')
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBe(0)
  await expect(board.locator('[data-workspace-status="completed"]')).toBeInViewport()
  await expect(sleepingLane).not.toHaveAttribute('data-workspace-status-drop-target')
  await expect(sleepingCard).not.toHaveAttribute('data-workspace-board-pointer-draggable')
  await expect(sleepingCard.locator('[draggable="true"]')).toHaveCount(0)
  await expect(sleepingLane.getByRole('button', { name: /New workspace/ })).toHaveCount(0)
  const sleepingX = await sleepingLane.evaluate((element) => element.getBoundingClientRect().x)
  const todo = board.locator('[data-workspace-status="todo"]')
  expect(await todo.evaluate((element) => element.getBoundingClientRect().x)).toBeGreaterThan(
    sleepingX
  )

  const awakeCard = todo.locator(`[data-workspace-board-worktree-id="${ids.awake}"]`)
  await expect(awakeCard).toBeVisible()
  const start = await awakeCard.boundingBox()
  const end = await sleepingLane.boundingBox()
  if (!start || !end) {
    throw new Error('Card geometry unavailable')
  }
  await orcaPage.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await orcaPage.mouse.down()
  await orcaPage.mouse.move(end.x + end.width - 2, end.y + 60, { steps: 12 })
  await orcaPage.mouse.up()
  await expect(awakeCard).toBeVisible()

  await orcaPage.evaluate(() => window.__store?.getState().setShowSleepingWorkspaces(false))
  await expect(sleepingCard).toHaveCount(0)
  await orcaPage.evaluate(() => window.__store?.getState().setShowSleepingWorkspaces(true))
  await expect(sleepingCard).toBeVisible()
  await orcaPage.evaluate((id) => {
    const store = window.__store
    if (!store) {
      throw new Error('Store unavailable')
    }
    const state = store.getState()
    store.setState({
      tabsByWorktree: {
        ...state.tabsByWorktree,
        [id]: [
          {
            id: 'board-wake-tab',
            worktreeId: id,
            ptyId: 'board-wake-pty',
            title: 'Shell',
            customTitle: null,
            color: null,
            isPinned: false,
            sortOrder: 0,
            createdAt: 0
          }
        ]
      },
      ptyIdsByTabId: { ...state.ptyIdsByTabId, 'board-wake-tab': ['board-wake-pty'] }
    })
  }, ids.sleeping)
  await expect(sleepingCard).toHaveCount(0)
  const review = board.locator('[data-workspace-status="in-review"]')
  await review.scrollIntoViewIfNeeded()
  await expect(review.locator(`[data-workspace-board-worktree-id="${ids.sleeping}"]`)).toBeVisible()
  await orcaPage.evaluate(() => {
    const store = window.__store
    if (!store) {
      throw new Error('Store unavailable')
    }
    store.setState({ ptyIdsByTabId: { ...store.getState().ptyIdsByTabId, 'board-wake-tab': [] } })
  })
  await sleepingLane.scrollIntoViewIfNeeded()
  await expect(sleepingCard).toBeVisible()
  for (const theme of ['light', 'dark'] as const) {
    await orcaPage.evaluate(
      (value) => window.__store?.getState().updateSettings({ theme: value }),
      theme
    )
    await orcaPage.screenshot({ path: testInfo.outputPath(`sleeping-${theme}.png`) })
  }
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(1100, 800)
  })
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeGreaterThan(1)
  await expect
    .poll(() =>
      board
        .locator('..')
        .evaluate((element) => element.getBoundingClientRect().right - window.innerWidth)
    )
    .toBeLessThanOrEqual(1)
})
