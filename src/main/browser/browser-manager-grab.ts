import { webContents } from 'electron'
import { buildGuestOverlayScript } from './grab-guest-script'
import { clampGrabPayload, clampGrabSelectedText } from './browser-grab-payload'
import { captureSelectionScreenshot as captureGrabSelectionScreenshot } from './browser-grab-screenshot'
import { getWorkspaceDocPageGuest } from './doc-preview-guest-policy'
import type {
  BrowserGrabCancelReason,
  BrowserGrabResult,
  BrowserGrabRect,
  BrowserGrabPayload,
  BrowserGrabScreenshot
} from './browser-manager-types'
import { BrowserManagerViewport } from './browser-manager-viewport'
import {
  buildResolveBrowserAnnotationAnchorsScript,
  parseResolvedBrowserAnnotationAnchors,
  type BrowserAnnotationAnchorRequest,
  type BrowserResolvedAnnotationAnchor
} from '../../shared/browser-annotation-anchor-resolution'
import { BROWSER_ANNOTATION_VIEWPORT_BRIDGE_WORLD_ID } from '../../shared/browser-annotation-viewport-bridge'

export abstract class BrowserManagerGrab extends BrowserManagerViewport {
  /** Authorize tools for browsing and document guests; documents stay outside browsing maps. */
  getAuthorizedGuest(
    browserTabId: string,
    senderWebContentsId: number
  ): Electron.WebContents | null {
    const docGuest = getWorkspaceDocPageGuest(browserTabId, senderWebContentsId)
    if (docGuest) {
      return docGuest
    }
    const registeredRenderer = this.rendererWebContentsIdByTabId.get(browserTabId)
    if (registeredRenderer == null || registeredRenderer !== senderWebContentsId) {
      return null
    }
    const guestId = this.webContentsIdByTabId.get(browserTabId)
    if (guestId == null) {
      return null
    }
    const guest = webContents.fromId(guestId)
    if (!guest || guest.isDestroyed()) {
      // Clear every per-tab entry when a guest is stale.
      this.unregisterGuest(browserTabId)
      return null
    }
    return guest
  }

  hasActiveGrabOp(browserTabId: string): boolean {
    return this.grabSessionController.hasActiveGrabOp(browserTabId)
  }

  async setGrabMode(
    browserTabId: string,
    enabled: boolean,
    guest: Electron.WebContents
  ): Promise<boolean> {
    if (!enabled) {
      const hadActiveGrabOp = this.hasActiveGrabOp(browserTabId)
      this.cancelGrabOp(browserTabId, 'user')
      if (hadActiveGrabOp) {
        return true
      }
      try {
        await guest.executeJavaScript(buildGuestOverlayScript('teardown'))
        return true
      } catch {
        return false
      }
    }
    // Arm eagerly so hover feedback appears before selection starts.
    try {
      await guest.executeJavaScript(buildGuestOverlayScript('arm'))
      return true
    } catch {
      return false
    }
  }

  awaitGrabSelection(
    browserTabId: string,
    opId: string,
    guest: Electron.WebContents
  ): Promise<BrowserGrabResult> {
    return this.grabSessionController.awaitGrabSelection(browserTabId, opId, guest)
  }

  cancelGrabOp(browserTabId: string, reason: BrowserGrabCancelReason): void {
    this.grabSessionController.cancelGrabOp(browserTabId, reason)
  }

  async captureSelectionScreenshot(
    _browserTabId: string,
    rect: BrowserGrabRect,
    guest: Electron.WebContents
  ): Promise<BrowserGrabScreenshot | null> {
    const releasePaint = this.holdPaintForCapture(guest.id)
    try {
      return await captureGrabSelectionScreenshot(rect, guest)
    } finally {
      releasePaint()
    }
  }

  /** Re-finds saved notes' elements after a reload; runs isolated so page scripts cannot spoof it. */
  async resolveAnnotationAnchors(
    anchors: readonly BrowserAnnotationAnchorRequest[],
    guest: Electron.WebContents
  ): Promise<BrowserResolvedAnnotationAnchor[]> {
    if (anchors.length === 0) {
      return []
    }
    try {
      const raw: unknown = await guest.executeJavaScriptInIsolatedWorld(
        BROWSER_ANNOTATION_VIEWPORT_BRIDGE_WORLD_ID,
        [{ code: buildResolveBrowserAnnotationAnchorsScript(anchors) }],
        false
      )
      return parseResolvedBrowserAnnotationAnchors(raw, anchors)
    } catch {
      return []
    }
  }

  /** Text selected inside the picked element since the pick; null when none or no pick is open. */
  async readGrabSelectedText(guest: Electron.WebContents): Promise<string | null> {
    try {
      return clampGrabSelectedText(
        await guest.executeJavaScript(buildGuestOverlayScript('readSelectedText'))
      )
    } catch {
      return null
    }
  }

  /** Preserve the active selection overlay and awaitClick listener. */
  async extractHoverPayload(
    _browserTabId: string,
    guest: Electron.WebContents
  ): Promise<BrowserGrabPayload | null> {
    try {
      const rawPayload = await guest.executeJavaScript(buildGuestOverlayScript('extractHover'))
      if (!rawPayload || typeof rawPayload !== 'object') {
        return null
      }
      return clampGrabPayload(rawPayload)
    } catch {
      return null
    }
  }
}
