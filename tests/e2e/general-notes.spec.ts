/**
 * E2E test for general notes: review notes not tied to a file.
 *
 * Why: the Notes shelf hides itself with no notes, so the only way in is the Source Control
 * overflow menu, and the composer is local UI state no store call can open. This drives that
 * path end to end: menu item, composer, the "General" group, and Copy all notes output.
 */

import { test, expect } from './helpers/orca-app'
import { waitForSessionReady, waitForActiveWorktree } from './helpers/store'

test.describe('General notes', () => {
  test.beforeEach(async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
  })

  test('adds a file-less note from Source Control and copies it first', async ({
    orcaPage,
    electronApp
  }) => {
    const worktreeId = await waitForActiveWorktree(orcaPage)
    await orcaPage.evaluate(() => {
      const state = window.__store?.getState()
      if (!state) {
        throw new Error('window.__store is not available')
      }
      state.setRightSidebarTab('explorer')
      state.setRightSidebarOpen(true)
    })
    await orcaPage.getByRole('button', { name: /Source Control/ }).click()

    await orcaPage.getByRole('button', { name: 'More source control actions' }).click()
    await orcaPage.getByRole('menuitem', { name: 'Add note for the AI…' }).click()
    const composer = orcaPage.getByRole('region', { name: 'General note' })
    await expect(composer).toBeVisible({ timeout: 10_000 })
    await composer.getByRole('textbox').fill('Bump the SDK before release')
    await composer.getByRole('button', { name: 'Add note' }).click()

    await expect(orcaPage.getByText('Bump the SDK before release')).toBeVisible()
    await expect(orcaPage.getByText('General', { exact: true })).toBeVisible()
    await expect
      .poll(() =>
        orcaPage.evaluate(
          (wId) =>
            window.__store
              ?.getState()
              .getGeneralNotes(wId)
              .map((note) => note.body),
          worktreeId
        )
      )
      .toEqual(['Bump the SDK before release'])

    await orcaPage.getByRole('button', { name: 'Copy all notes to clipboard' }).click()
    await expect
      .poll(() => electronApp.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe('Scope: workspace\nUser comment: "Bump the SDK before release"')
  })

  test('adds a note from the workspace card menu', async ({ orcaPage }) => {
    const worktreeId = await waitForActiveWorktree(orcaPage)
    const card = orcaPage.locator(
      `[data-worktree-sidebar] [data-worktree-id=${JSON.stringify(worktreeId)}]`
    )
    await card.first().click({ button: 'right' })
    await orcaPage.getByRole('menuitem', { name: 'Add note for the AI…' }).click()

    const dialog = orcaPage.getByRole('dialog', { name: 'Notes for the AI' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await dialog.getByRole('textbox').fill('Write the changelog entry')
    await dialog.getByRole('button', { name: 'Add note', exact: true }).first().click()

    await expect(dialog.getByText('Write the changelog entry')).toBeVisible()
    await expect
      .poll(() =>
        orcaPage.evaluate(
          (wId) =>
            window.__store
              ?.getState()
              .getGeneralNotes(wId)
              .map((note) => note.body),
          worktreeId
        )
      )
      .toContain('Write the changelog entry')
  })
})
