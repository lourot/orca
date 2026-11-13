// Unsent browser notes outlive a reload (badge re-found by selector) and their tab (kept on the worktree).

import { createServer, type Server } from 'node:http'
import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import {
  ensureTerminalVisible,
  switchToOtherWorktree,
  switchToWorktree,
  waitForActiveWorktree,
  waitForSessionReady
} from './helpers/store'
import { waitForGuestUrl } from './helpers/browser-split-guest-probes'
import { pickGuestElementForAnnotation } from './helpers/browser-annotate-pick'

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
}

/** A reload moves #target from 300px to 600px down, as an agent's edit would. Later loads
 * (the guest sometimes loads twice) keep it there, so the re-pin check does not count loads. */
async function startMovingTargetServer(): Promise<{
  url: string
  server: Server
  loads: () => number
}> {
  let loads = 0
  const server = createServer((_request, response) => {
    loads += 1
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    })
    response.end(
      `<!doctype html><title>Notes</title><body style="margin:0"><div style="height:${Math.min(loads, 2) * 300}px"></div><button id="target">Save</button></body>`
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Notes page server has no TCP port')
  }
  return { url: `http://127.0.0.1:${address.port}/`, server, loads: () => loads }
}

function activePageId(page: Page, worktreeId: string, tabId: string): Promise<string | null> {
  return page.evaluate(
    ({ worktreeId, tabId }) =>
      window.__store?.getState().browserTabsByWorktree[worktreeId]?.find((tab) => tab.id === tabId)
        ?.activePageId ?? null,
    { worktreeId, tabId }
  )
}

test('a note is re-pinned after a reload and comes back after its tab closes', async ({
  orcaPage
}) => {
  const { url, server } = await startMovingTargetServer()
  try {
    await waitForSessionReady(orcaPage)
    await ensureTerminalVisible(orcaPage)
    const worktreeId = await waitForActiveWorktree(orcaPage)
    const tabId = await orcaPage.evaluate(
      ({ worktreeId, url }) =>
        window.__store?.getState().createBrowserTab(worktreeId, url, { activate: true }).id ?? null,
      { worktreeId, url }
    )
    if (!tabId) {
      throw new Error('browser tab was not created')
    }
    await expect.poll(() => activePageId(orcaPage, worktreeId, tabId)).not.toBeNull()
    const pageId = (await activePageId(orcaPage, worktreeId, tabId)) ?? ''
    await waitForGuestUrl(orcaPage, tabId, url)

    // A note taken on the first document, where #target sat 300px down.
    await orcaPage.evaluate(
      ({ pageId, url }) => {
        const rect = { x: 0, y: 300, width: 60, height: 20 }
        window.__store?.getState().addBrowserPageAnnotation({
          id: 'note-1',
          browserPageId: pageId,
          comment: 'Make this green',
          intent: 'change',
          priority: 'important',
          createdAt: new Date().toISOString(),
          payload: {
            page: {
              sanitizedUrl: url,
              title: 'Notes',
              viewportWidth: 800,
              viewportHeight: 600,
              scrollX: 0,
              scrollY: 0,
              devicePixelRatio: 1,
              capturedAt: new Date().toISOString()
            },
            target: {
              tagName: 'button',
              selector: '#target',
              textSnippet: 'Save',
              htmlSnippet: '<button id="target">Save</button>',
              attributes: { id: 'target' },
              accessibility: {
                role: 'button',
                accessibleName: 'Save',
                ariaLabel: null,
                ariaLabelledBy: null
              },
              rectViewport: rect,
              rectPage: rect,
              computedStyles: {
                display: 'inline-block',
                position: 'static',
                width: '60px',
                height: '20px',
                margin: '0px',
                padding: '0px',
                color: '',
                backgroundColor: '',
                border: '',
                borderRadius: '',
                fontFamily: '',
                fontSize: '',
                fontWeight: '',
                lineHeight: '',
                textAlign: '',
                zIndex: ''
              }
            },
            nearbyText: [],
            ancestorPath: [],
            screenshot: null
          }
        })
      },
      { pageId, url }
    )

    // The agent's edit reloads the page; #target is now 600px down and main finds it again.
    await orcaPage.evaluate((tabId) => {
      document
        .querySelector<Electron.WebviewTag>(`[data-browser-overlay-tab-id="${tabId}"] webview`)
        ?.reload()
    }, tabId)
    await expect
      .poll(
        () =>
          orcaPage.evaluate(
            (pageId) =>
              window.__store?.getState().browserAnnotationAnchorsByPageId[pageId]?.['note-1']
                ?.rectPage.y ?? null,
            pageId
          ),
        { timeout: 20_000 }
      )
      .toBe(600)

    // Closing the tab keeps the note on the worktree, visible on its card.
    await orcaPage.evaluate((tabId) => window.__store?.getState().closeBrowserTab(tabId), tabId)
    const chip = orcaPage.locator(
      `[data-worktree-id="${worktreeId}"] [data-detached-browser-notes]`
    )
    await expect(chip).toBeVisible({ timeout: 10_000 })
    await chip.click()
    await orcaPage.getByRole('button', { name: 'Reopen with notes' }).click()

    await expect
      .poll(() =>
        orcaPage.evaluate((worktreeId) => {
          const state = window.__store?.getState()
          const reopened = state?.browserTabsByWorktree[worktreeId]?.at(-1)?.activePageId
          return reopened
            ? (state?.browserAnnotationsByPageId[reopened] ?? []).map((note) => note.comment)
            : []
        }, worktreeId)
      )
      .toEqual(['Make this green'])
    await expect(chip).toHaveCount(0)
  } finally {
    await closeServer(server)
  }
})

test('a half-typed note survives an outside click and a trip to another worktree', async ({
  orcaPage
}) => {
  const { url, server, loads } = await startMovingTargetServer()
  try {
    await waitForSessionReady(orcaPage)
    await ensureTerminalVisible(orcaPage)
    const worktreeId = await waitForActiveWorktree(orcaPage)
    const tabId = await orcaPage.evaluate(
      ({ worktreeId, url }) =>
        window.__store?.getState().createBrowserTab(worktreeId, url, { activate: true }).id ?? null,
      { worktreeId, url }
    )
    if (!tabId) {
      throw new Error('browser tab was not created')
    }
    await expect.poll(() => activePageId(orcaPage, worktreeId, tabId)).not.toBeNull()
    const pageId = (await activePageId(orcaPage, worktreeId, tabId)) ?? ''
    await waitForGuestUrl(orcaPage, tabId, url)

    await pickGuestElementForAnnotation(orcaPage, { tabId, pageId, selector: '#target', loads })
    const comment = orcaPage.getByRole('textbox', { name: 'Annotation comment' })
    await comment.fill('Half typed')

    // Going to copy text elsewhere must not discard what was typed.
    await orcaPage.evaluate(() => {
      for (const type of ['pointerdown', 'pointerup'] as const) {
        document.body.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse' }))
      }
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await expect(comment).toHaveValue('Half typed')

    const otherWorktreeId = await switchToOtherWorktree(orcaPage, worktreeId)
    test.skip(!otherWorktreeId, 'the fixture has a single worktree')
    await expect(comment).toHaveCount(0)
    await switchToWorktree(orcaPage, worktreeId)
    await expect(comment).toHaveValue('Half typed', { timeout: 10_000 })
  } finally {
    await closeServer(server)
  }
})
