import type { Page } from '@stablyai/playwright-test'
import { expect } from './orca-app'
import {
  browserOverlay,
  guestModifier,
  pressKeyInBrowserGuest,
  type GuestModifier
} from './browser-split-fixture'

// Default annotate chord: Cmd+Shift+C on macOS, Alt+Shift+N on Linux and Windows.
const annotateGuestChord: { keyCode: string; modifiers: GuestModifier[] } =
  process.platform === 'darwin'
    ? { keyCode: 'C', modifiers: [guestModifier, 'shift'] }
    : { keyCode: 'N', modifiers: ['alt', 'shift'] }

/** Arms annotate mode and clicks `selector` in the guest until the comment card opens.
 * The guest sometimes loads twice, which cancels an armed pick and moves the target, so this
 * waits for `loads` to settle first and retries. `prepare` runs before each attempt. */
export async function pickGuestElementForAnnotation(
  page: Page,
  options: {
    tabId: string
    pageId: string
    selector: string
    loads: () => number
    prepare?: () => Promise<void>
  }
): Promise<void> {
  const { tabId, pageId, selector, loads, prepare } = options
  await expect
    .poll(
      async () => {
        const before = loads()
        await page.waitForTimeout(1_500)
        return before > 0 && loads() === before
      },
      { timeout: 20_000 }
    )
    .toBe(true)
  const annotateBanner = browserOverlay(page, tabId).getByText(
    'Click an element to add feedback for the agent.'
  )
  const comment = page.getByRole('textbox', { name: 'Annotation comment' })
  await expect(async () => {
    await prepare?.()
    if (!(await annotateBanner.isVisible())) {
      await pressKeyInBrowserGuest(
        page,
        tabId,
        pageId,
        annotateGuestChord.keyCode,
        annotateGuestChord.modifiers
      )
      await expect(annotateBanner).toBeVisible({ timeout: 2_000 })
    }
    await page.evaluate(
      async ({ tabId, selector }) => {
        const webview = document.querySelector<Electron.WebviewTag>(
          `[data-browser-overlay-tab-id="${tabId}"] webview`
        )
        const box: { x: number; y: number } | null = await webview?.executeJavaScript(
          `(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })()`
        )
        if (!webview || !box) {
          return
        }
        for (const type of ['mouseMove', 'mouseDown', 'mouseUp'] as const) {
          await webview.sendInputEvent({
            type,
            x: Math.round(box.x),
            y: Math.round(box.y),
            button: 'left',
            clickCount: 1
          })
        }
      },
      { tabId, selector }
    )
    await expect(comment).toBeVisible({ timeout: 2_000 })
    // Passing runs have needed up to 17s of re-arming.
  }).toPass({ timeout: 25_000 })
}
