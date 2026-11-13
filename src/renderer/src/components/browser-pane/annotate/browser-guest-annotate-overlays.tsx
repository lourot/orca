import { createPortal } from 'react-dom'
import type { MutableRefObject, RefObject } from 'react'
import { Copy, Image } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { MarkupOverlay } from './MarkupOverlay'
import type { MarkupModeController } from './useMarkupMode'
import type { GrabModeHook } from './useGrabMode'
import {
  getBrowserOverlayAnchor,
  getPaneCenterOverlayAnchor,
  type BrowserOverlayViewport
} from '../describe-page/browser-annotation-geometry'
import { BrowserPageAnnotationTray } from './browser-page-annotation-tray'
import { BrowserPageGrabToast } from './browser-page-grab-toast'
import { PendingBrowserAnnotationCard } from './pending-browser-annotation-card'
import { useBrowserAnnotationDraftSync } from './use-browser-annotation-draft-sync'
import { DetachedBrowserNotesButton, useDetachedBrowserNoteCount } from './detached-browser-notes'
import { browserAnnotationMatchesPageUrl } from './browser-annotation-page-url'
import { useAppStore } from '@/store'
import type { useBrowserPageAnnotationSend } from './use-browser-page-annotation-send'
import type { useBrowserPageGrabAnnotations } from './use-browser-page-grab-annotations'

/** Pair guest tools with all their result overlays so every surface that arms a picker can display its result. */
export function BrowserGuestAnnotateOverlays({
  markup,
  grab,
  annotationSend,
  grabAnnotations,
  containerRef,
  markupPortalContainer,
  markupControlsContainer,
  webviewRef,
  browserOverlayViewport,
  worktreeId,
  pageId,
  currentUrl
}: {
  markup: MarkupModeController
  grab: GrabModeHook
  annotationSend: ReturnType<typeof useBrowserPageAnnotationSend>
  grabAnnotations: ReturnType<typeof useBrowserPageGrabAnnotations>
  containerRef: RefObject<HTMLDivElement | null>
  markupPortalContainer?: HTMLDivElement | null
  markupControlsContainer?: HTMLDivElement | null
  webviewRef: MutableRefObject<Electron.WebviewTag | null>
  browserOverlayViewport: BrowserOverlayViewport
  worktreeId: string
  /** The page notes from closed pages can be added to. */
  pageId: string
  currentUrl?: string
}): React.JSX.Element {
  const detachedNoteCount = useDetachedBrowserNoteCount(worktreeId)
  // Optional reads: pane suites mock partial stores without these maps.
  const anchors = useAppStore((s) => s.browserAnnotationAnchorsByPageId?.[pageId])
  const markerIds = useAppStore((s) => s.browserAnnotationMarkerIdsByPageId?.[pageId])
  const detachedNotes =
    detachedNoteCount > 0 ? (
      <DetachedBrowserNotesButton
        worktreeId={worktreeId}
        count={detachedNoteCount}
        attachToPageId={pageId}
        showLabel
      />
    ) : null
  const {
    pendingAnnotationPayload,
    pendingAnnotationUnanchored,
    handleAddBrowserAnnotation,
    handleCancelPendingBrowserAnnotation,
    grabIntent,
    grabMenuActionTakenRef,
    handleGrabCopy,
    handleGrabCopyScreenshot,
    grabToast,
    grabToastTimerRef,
    dismissGrabToast,
    setGrabToast
  } = grabAnnotations
  const pendingDraft = useBrowserAnnotationDraftSync(pageId, pendingAnnotationPayload)
  const markupTarget = markupPortalContainer ?? containerRef.current
  const {
    browserAnnotations,
    annotationTraySendOpen,
    handleAnnotationTraySendOpenChange,
    activeGroupId,
    browserAnnotationsPrompt,
    includePageDetails,
    handleIncludePageDetailsChange,
    handleBrowserAnnotationsSentToAgent,
    handleBrowserAnnotationsHandedOff,
    handleCopyBrowserAnnotations,
    browserAnnotationsCopied,
    handleClearBrowserAnnotations,
    handleDeleteBrowserAnnotation,
    handleUpdateBrowserAnnotation
  } = annotationSend

  return (
    <>
      {markup.isActive && markup.baseImage && markupTarget
        ? createPortal(
            <MarkupOverlay
              baseImage={markup.baseImage}
              busy={markup.state === 'composing'}
              onComplete={(input) => void markup.complete(input)}
              onCancel={markup.cancel}
              controlsContainer={markupControlsContainer}
            />,
            markupTarget
          )
        : null}
      {pendingAnnotationPayload ? (
        <PendingBrowserAnnotationCard
          payload={pendingAnnotationPayload}
          worktreeId={worktreeId}
          resolveAnchor={(cardHeight) =>
            pendingAnnotationUnanchored
              ? getPaneCenterOverlayAnchor(containerRef.current)
              : getBrowserOverlayAnchor(
                  pendingAnnotationPayload,
                  containerRef.current,
                  webviewRef.current,
                  browserOverlayViewport,
                  cardHeight
                )
          }
          portalContainer={containerRef.current}
          initialDraft={pendingDraft.initialDraft}
          onDraftChange={pendingDraft.onDraftChange}
          onAdd={handleAddBrowserAnnotation}
          onCancel={handleCancelPendingBrowserAnnotation}
        />
      ) : null}
      {browserAnnotations.length > 0 ? (
        <BrowserPageAnnotationTray
          browserAnnotations={browserAnnotations}
          currentUrl={currentUrl}
          isNotFound={(annotation) =>
            // Only once resolution ran for this document, and only for notes taken on it.
            anchors !== undefined &&
            !anchors[annotation.id] &&
            !markerIds?.includes(annotation.id) &&
            (currentUrl === undefined ||
              browserAnnotationMatchesPageUrl(annotation.payload.page.sanitizedUrl, currentUrl))
          }
          annotationTraySendOpen={annotationTraySendOpen}
          handleAnnotationTraySendOpenChange={handleAnnotationTraySendOpenChange}
          worktreeId={worktreeId}
          activeGroupId={activeGroupId}
          browserAnnotationsPrompt={browserAnnotationsPrompt}
          includePageDetails={includePageDetails}
          handleIncludePageDetailsChange={handleIncludePageDetailsChange}
          handleBrowserAnnotationsSentToAgent={handleBrowserAnnotationsSentToAgent}
          handleBrowserAnnotationsHandedOff={handleBrowserAnnotationsHandedOff}
          handleCopyBrowserAnnotations={handleCopyBrowserAnnotations}
          browserAnnotationsCopied={browserAnnotationsCopied}
          handleClearBrowserAnnotations={handleClearBrowserAnnotations}
          handleDeleteBrowserAnnotation={handleDeleteBrowserAnnotation}
          handleUpdateBrowserAnnotation={handleUpdateBrowserAnnotation}
          detachedNotes={detachedNotes}
        />
      ) : detachedNotes ? (
        <div className="absolute right-3 bottom-3 z-30 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
          {detachedNotes}
        </div>
      ) : null}
      {/* Right-click context dropdown, positioned at the grabbed element's center. */}
      <DropdownMenu
        open={grab.state === 'confirming' && grab.contextMenu && grabIntent === 'copy'}
        onOpenChange={(open) => {
          if (!open && grab.state === 'confirming') {
            // Why: skip rearm if a menu action already handled it — see grabMenuActionTakenRef.
            if (grabMenuActionTakenRef.current) {
              grabMenuActionTakenRef.current = false
              return
            }
            grab.rearm()
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            aria-hidden
            tabIndex={-1}
            className="pointer-events-none absolute size-px opacity-0"
            style={(() => {
              if (!grab.payload) {
                return { left: 0, top: 0 }
              }
              const rect = grab.payload.target.rectViewport
              const webview = webviewRef.current
              const webviewRect = webview?.getBoundingClientRect()
              const cRect = containerRef.current?.getBoundingClientRect()
              const offsetX = (webviewRect?.left ?? 0) - (cRect?.left ?? 0)
              const offsetY = (webviewRect?.top ?? 0) - (cRect?.top ?? 0)
              return {
                left: offsetX + rect.x + rect.width / 2,
                top: offsetY + rect.y + rect.height / 2
              }
            })()}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={4}>
          <DropdownMenuItem onSelect={handleGrabCopy}>
            <Copy className="size-3.5" />
            {translate('auto.components.browser.pane.BrowserPane.c2ef0359b9', 'Copy Contents')}
            <DropdownMenuShortcut>C</DropdownMenuShortcut>
          </DropdownMenuItem>
          {grab.payload?.screenshot?.dataUrl?.startsWith('data:image/png;base64,') ? (
            <DropdownMenuItem onSelect={handleGrabCopyScreenshot}>
              <Image className="size-3.5" />
              {translate('auto.components.browser.pane.BrowserPane.1ded0d3168', 'Copy Screenshot')}
              <DropdownMenuShortcut>S</DropdownMenuShortcut>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              grabMenuActionTakenRef.current = true
              grab.cancel()
            }}
          >
            {translate('auto.components.browser.pane.BrowserPane.fa6ea61de3', 'Cancel')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Inline toast bubble; flips above the element when near the viewport bottom so it doesn't occlude it. */}
      {grabToast ? (
        <BrowserPageGrabToast
          grabToast={grabToast}
          grabToastTimerRef={grabToastTimerRef}
          dismissGrabToast={dismissGrabToast}
          setGrabToast={setGrabToast}
        />
      ) : null}
    </>
  )
}
