import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { runProcess } from '../../src/shared/child-process/run-process'

test.use({ seedTestRepo: false })

async function git(cwd: string, args: string[]): Promise<void> {
  const result = await runProcess({ program: 'git', args, cwd, timeoutMs: 10_000 })
  expect(result.code, result.stderr).toBe(0)
}

async function seedRepo(root: string, name: string): Promise<string> {
  const repoPath = path.join(root, name)
  mkdirSync(repoPath)
  writeFileSync(path.join(repoPath, 'seed.txt'), 'seed\n')
  await git(repoPath, ['init'])
  await git(repoPath, ['add', '.'])
  await git(repoPath, [
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-m',
    'seed'
  ])
  return repoPath
}

test('a collapsed project reports uncommitted changes, and a clean one does not', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  await waitForSessionReady(orcaPage)
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'orca-uncommitted-')))
  registerPostElectronShutdownCleanup(async () => {
    rmSync(root, { recursive: true, force: true })
  })

  const dirtyPath = await seedRepo(root, 'dirty-repo')
  const cleanPath = await seedRepo(root, 'clean-repo')
  // Untracked-only, which is the case the dirty rule deliberately counts.
  writeFileSync(path.join(dirtyPath, 'scratch.txt'), 'work in progress\n')

  const repoIds = await orcaPage.evaluate(
    async (paths) => {
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
      return Object.fromEntries(repos.map((repo) => [repo.path, repo.id]))
    },
    [dirtyPath, cleanPath]
  )

  const dirtyRepoId = repoIds[dirtyPath]
  const cleanRepoId = repoIds[cleanPath]
  expect(dirtyRepoId, 'dirty repo registered').toBeTruthy()
  expect(cleanRepoId, 'clean repo registered').toBeTruthy()

  // Collapse both projects: the dot has to survive without the worktree rows.
  await orcaPage.evaluate(
    async (ids) => {
      const collapsedGroups = ids.map((repoId) => `repo:${repoId}`)
      await window.api.ui.set({ groupBy: 'repo', collapsedGroups })
      window.__store!.setState({ collapsedGroups: new Set(collapsedGroups) })
    },
    [dirtyRepoId, cleanRepoId]
  )

  const scroller = orcaPage.locator('[data-worktree-sidebar]')
  const dirtyHeader = scroller.locator(`[data-repo-header-id="${dirtyRepoId}"]`)
  const cleanHeader = scroller.locator(`[data-repo-header-id="${cleanRepoId}"]`)
  await expect(dirtyHeader).toBeVisible()
  await expect(cleanHeader).toBeVisible()

  // The sweep is async, so poll rather than assert on the first paint.
  await expect(dirtyHeader.locator('[data-project-uncommitted-changes]')).toBeVisible({
    timeout: 20_000
  })
  await expect(cleanHeader.locator('[data-project-uncommitted-changes]')).toHaveCount(0)
})

test('an expanded project marks which worktree holds the uncommitted changes', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  await waitForSessionReady(orcaPage)
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'orca-uncommitted-row-')))
  registerPostElectronShutdownCleanup(async () => {
    rmSync(root, { recursive: true, force: true })
  })

  const dirtyPath = await seedRepo(root, 'dirty-repo')
  const cleanPath = await seedRepo(root, 'clean-repo')
  writeFileSync(path.join(dirtyPath, 'scratch.txt'), 'work in progress\n')

  const worktreeIds = await orcaPage.evaluate(
    async (paths) => {
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
      // Expanded is the default; this test is about the rows, not the rollup.
      await window.api.ui.set({ groupBy: 'repo', collapsedGroups: [] })
      store.setState({ collapsedGroups: new Set() })
      const worktreesByRepo = store.getState().worktreesByRepo
      return Object.fromEntries(
        repos.map((repo) => [repo.path, worktreesByRepo[repo.id]?.[0]?.id ?? ''])
      )
    },
    [dirtyPath, cleanPath]
  )

  const dirtyWorktreeId = worktreeIds[dirtyPath]
  const cleanWorktreeId = worktreeIds[cleanPath]
  expect(dirtyWorktreeId, 'dirty worktree listed').toBeTruthy()
  expect(cleanWorktreeId, 'clean worktree listed').toBeTruthy()

  const scroller = orcaPage.locator('[data-worktree-sidebar]')
  const dirtyRow = scroller.locator(`[data-worktree-id="${dirtyWorktreeId}"]`).first()
  const cleanRow = scroller.locator(`[data-worktree-id="${cleanWorktreeId}"]`).first()
  await expect(dirtyRow).toBeVisible()
  await expect(cleanRow).toBeVisible()

  await expect(dirtyRow.locator('[data-worktree-uncommitted-changes]')).toBeVisible({
    timeout: 20_000
  })
  await expect(cleanRow.locator('[data-worktree-uncommitted-changes]')).toHaveCount(0)
})
