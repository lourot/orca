import type {
  BrowserGrabPayload,
  BrowserPageAnnotation
} from '../../../../../shared/browser-grab-types'
import type { BrowserResolvedAnnotationAnchor } from '../../../../../shared/browser-annotation-anchor-resolution'
import { browserAnnotationMatchesPageUrl } from './browser-annotation-page-url'

// Guest-rendered badges track scrolling without a renderer message per frame.
export function syncGuestAnnotationViewportBridge({
  toolTargetId,
  annotations,
  currentDocument,
  anchors,
  pendingPayload,
  surfaceActive,
  token
}: {
  toolTargetId: string
  annotations: BrowserPageAnnotation[]
  /** Without a URL, every marker id counts (previews capture no page URL). */
  currentDocument?: { markerIds: readonly string[]; url?: string }
  /** Notes re-found by selector in the current document; their geometry wins. */
  anchors?: Record<string, BrowserResolvedAnnotationAnchor>
  pendingPayload: BrowserGrabPayload | null
  surfaceActive: boolean
  token: string
}): void {
  // Why: existing badges render in-guest for smooth scroll; only the pending dialog needs viewport messages.
  const eligibleIds = currentDocument ? new Set(currentDocument.markerIds) : null
  // Keep tray numbering even when earlier notes belong to retired documents.
  const markers = annotations.flatMap((annotation, index) => {
    const anchor = anchors?.[annotation.id]
    if (anchor) {
      return [
        {
          id: annotation.id,
          index,
          isFixed: anchor.isFixed,
          rectPage: anchor.rectPage,
          rectViewport: anchor.rectViewport
        }
      ]
    }
    return currentDocument &&
      (!eligibleIds?.has(annotation.id) ||
        (currentDocument.url !== undefined &&
          !browserAnnotationMatchesPageUrl(
            annotation.payload.page.sanitizedUrl,
            currentDocument.url
          )))
      ? []
      : [
          {
            id: annotation.id,
            index,
            isFixed: annotation.payload.target.isFixed === true,
            rectPage: annotation.payload.target.rectPage,
            rectViewport: annotation.payload.target.rectViewport
          }
        ]
  })
  void window.api.browser
    .setAnnotationViewportBridge({
      browserPageId: toolTargetId,
      emitViewport: pendingPayload !== null,
      enabled: surfaceActive && (pendingPayload !== null || markers.length > 0),
      markers,
      selectionId: pendingPayload?.page.capturedAt,
      token
    })
    .catch(() => {
      // The viewport bridge is visual-only; stale markers beat breaking the surface on a destroyed guest.
    })
}
