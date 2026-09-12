import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { runProcess } from '../../src/shared/child-process/run-process'

/**
 * Sidebar holes and misparented rows, from one drifted number: when the virtualizer's
 * believed offset outruns a `scrollTop` the element cannot move, the sticky-header pick and
 * the range extractor both follow the belief, so a project header goes missing and its row
 * lands under the next project's.
 *
 * Compact -> Detailed grows every card at once, including the ones below the fold, which
 * makes the several-times-a-day bug fire every time.
 */

test.use({ seedTestRepo: false })

const REPO_COUNT = 8

test('every project header survives cards growing below the fold', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  await waitForSessionReady(orcaPage)
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'orca-scroll-drift-')))
  registerPostElectronShutdownCleanup(async () => {
    rmSync(root, { recursive: true, force: true })
  })

  const paths = Array.from({ length: REPO_COUNT }, (_, index) =>
    path.join(root, `repo-${String(index).padStart(2, '0')}`)
  )
  for (const repoPath of paths) {
    mkdirSync(repoPath)
    writeFileSync(path.join(repoPath, 'seed.txt'), 'seed\n')
    for (const args of [
      ['init'],
      ['add', '.'],
      [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-m',
        'seed'
      ]
    ]) {
      const result = await runProcess({ program: 'git', args, cwd: repoPath, timeoutMs: 10_000 })
      expect(result.code, result.stderr).toBe(0)
    }
  }

  const repoIds = await orcaPage.evaluate(async (paths) => {
    const store = window.__store!
    for (const repoPath of paths) {
      await window.api.repos.add({ path: repoPath })
    }
    await store.getState().awaitLocalRepoCatalogSettlement()
    const repos = store.getState().repos.filter((repo) => paths.includes(repo.path))
    for (const repo of repos) {
      await store.getState().fetchWorktrees(repo.id)
    }
    store.getState().setGroupBy('repo')
    store.getState().setSortBy('recent')
    // Compact first, so the switch below is a pure growth of every card.
    await store.getState().updateSettings({ compactWorktreeCards: true })
    return repos.map((repo) => repo.id)
  }, paths)
  expect(repoIds).toHaveLength(REPO_COUNT)

  const sidebar = orcaPage.locator('[data-worktree-sidebar]')
  await expect(sidebar).toBeVisible({ timeout: 30_000 })
  const headerIds = () =>
    sidebar
      .locator('[data-repo-header-id]')
      .evaluateAll((nodes) =>
        nodes
          .map((node) => node.getAttribute('data-repo-header-id'))
          .filter((id): id is string => id !== null)
      )
  await expect.poll(async () => (await headerIds()).length).toBe(REPO_COUNT)

  // The list must be shorter than the viewport, or the element can absorb the correction
  // and there is no drift to observe. Assert it rather than assume it.
  const scrollable = await sidebar.evaluate((node) => node.scrollHeight - node.clientHeight > 0)
  expect(scrollable, 'the seeded sidebar must not scroll, or this test proves nothing').toBe(false)

  // The growth: every card gets taller, including the ones below the fold.
  await orcaPage.evaluate(async () => {
    await window.__store!.getState().updateSettings({ compactWorktreeCards: false })
  })

  // Why poll: the correction is booked during a measurement pass, so the wrong frame can
  // be the second one, not the first.
  await expect
    .poll(async () => (await headerIds()).sort().join(','), { timeout: 15_000 })
    .toBe([...repoIds].sort().join(','))

  const { scrollTop, pinned } = await sidebar.evaluate((node) => ({
    scrollTop: node.scrollTop,
    pinned: node
      .querySelector('[data-worktree-sticky-header-active]')
      ?.querySelector('[data-repo-header-id]')
      ?.getAttribute('data-repo-header-id')
  }))
  expect(scrollTop).toBe(0)
  // A drifted belief pins a later header over row 0 and blanks its own slot.
  const firstHeaderId = (await headerIds())[0]
  expect(pinned ?? firstHeaderId).toBe(firstHeaderId)
})
