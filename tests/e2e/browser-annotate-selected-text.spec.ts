// Text selected before arming, or after the pick while the note is open, labels the note.

import { createServer, type Server } from 'node:http'
import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { waitForGuestUrl } from './helpers/browser-split-guest-probes'
import { pickGuestElementForAnnotation } from './helpers/browser-annotate-pick'

async function startParagraphServer(): Promise<{
  url: string
  server: Server
  loads: () => number
}> {
  let loads = 0
  const server = createServer((_request, response) => {
    loads += 1
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(
      '<!doctype html><title>Paragraph</title><body><p id="target">Hello <b>big</b> world</p></body>'
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Paragraph server has no TCP port')
  }
  return { url: `http://127.0.0.1:${address.port}/`, server, loads: () => loads }
}

/** Opens the served page in a new browser tab and waits for its guest. */
async function openParagraphTab(
  page: Page,
  url: string
): Promise<{ tabId: string; pageId: string }> {
  await waitForSessionReady(page)
  await ensureTerminalVisible(page)
  const worktreeId = await waitForActiveWorktree(page)
  const tabId = await page.evaluate(
    ({ worktreeId, url }) =>
      window.__store?.getState().createBrowserTab(worktreeId, url, { activate: true }).id ?? null,
    { worktreeId, url }
  )
  if (!tabId) {
    throw new Error('browser tab was not created')
  }
  let pageId = ''
  await expect
    .poll(async () => {
      pageId = await page.evaluate(
        ({ worktreeId, tabId }) =>
          window.__store?.getState().browserTabsByWorktree[worktreeId]?.find((t) => t.id === tabId)
            ?.activePageId ?? '',
        { worktreeId, tabId }
      )
      return pageId
    })
    .not.toBe('')
  await waitForGuestUrl(page, tabId, url)
  return { tabId, pageId }
}

/** Selects "big world" inside #target in the guest. */
async function selectBigWorld(page: Page, tabId: string): Promise<void> {
  await page.evaluate(async (tabId) => {
    await document
      .querySelector<Electron.WebviewTag>(`[data-browser-overlay-tab-id="${tabId}"] webview`)
      ?.executeJavaScript(
        `(() => { const b = document.querySelector('#target b'); const range = document.createRange(); range.setStart(b.firstChild, 0); range.setEnd(b.nextSibling, b.nextSibling.length); const s = getSelection(); s.removeAllRanges(); s.addRange(range) })()`
      )
  }, tabId)
}

test('a note on selected text quotes only the selection', async ({ orcaPage }) => {
  const { url, server, loads } = await startParagraphServer()
  try {
    const { tabId, pageId } = await openParagraphTab(orcaPage, url)

    await pickGuestElementForAnnotation(orcaPage, {
      tabId,
      pageId,
      selector: '#target',
      loads,
      // A reload between attempts drops the selection, so select again each time.
      prepare: () => selectBigWorld(orcaPage, tabId)
    })

    await expect(orcaPage.getByText('"big world"')).toBeVisible()
    await orcaPage.evaluate((tabId) => window.__store?.getState().closeBrowserTab(tabId), tabId)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
})

test('text selected after the pick is quoted when the note is added', async ({ orcaPage }) => {
  const { url, server, loads } = await startParagraphServer()
  try {
    const { tabId, pageId } = await openParagraphTab(orcaPage, url)
    await pickGuestElementForAnnotation(orcaPage, { tabId, pageId, selector: '#target', loads })

    await selectBigWorld(orcaPage, tabId)
    const comment = orcaPage.getByRole('textbox', { name: 'Annotation comment' })
    await comment.fill('Reword this')
    await comment.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter')

    await expect
      .poll(() =>
        orcaPage.evaluate(
          (pageId) =>
            window.__store?.getState().browserAnnotationsByPageId[pageId]?.[0]?.payload.target
              .selectedText ?? null,
          pageId
        )
      )
      .toBe('big world')
    await orcaPage.evaluate((tabId) => window.__store?.getState().closeBrowserTab(tabId), tabId)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
})
