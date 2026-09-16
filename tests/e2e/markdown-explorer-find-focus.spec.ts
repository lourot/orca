import { expect, test } from './helpers/orca-app'
import { openFileExplorer } from './helpers/file-explorer'
import { switchActiveTabToRichMarkdown } from './helpers/markdown-editor-fixture'
import { pressShortcut } from './helpers/shortcuts'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test('Explorer-opened Markdown accepts the find shortcut without a document click', async ({
  orcaPage
}) => {
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  await openFileExplorer(orcaPage)

  const readmeRow = orcaPage.locator('[data-file-explorer-row]').filter({ hasText: 'README.md' })
  await expect(readmeRow).toBeVisible({ timeout: 10_000 })
  await readmeRow.focus()
  await readmeRow.click()

  // Markdown opens in source; the focus handoff has to survive the switch into
  // rich mode, which is what makes the find shortcut work without a click.
  await expect(orcaPage.locator('.editor-header-path').first()).toContainText('README.md', {
    timeout: 25_000
  })
  await switchActiveTabToRichMarkdown(orcaPage)

  await expect(orcaPage.locator('.rich-markdown-editor')).toBeVisible({ timeout: 25_000 })
  await pressShortcut(orcaPage, 'f')

  await expect(
    orcaPage.getByRole('textbox', { name: 'Find in rich markdown editor' })
  ).toBeVisible()
})
