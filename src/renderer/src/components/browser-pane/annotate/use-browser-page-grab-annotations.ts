import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { useMountedRef } from '@/hooks/useMountedRef'
import { useAppStore } from '@/store'
import {
  isBrowserAnnotationPageFull,
  type BrowserAnnotationIntent,
  type BrowserGrabPayload
} from '../../../../../shared/browser-grab-types'
import { formatGrabPayloadAsText } from './GrabConfirmationSheet'
import { browserAnnotationLimitMessage } from './browser-annotation-limit-message'
import {
  createBrowserAnnotationId,
  createBrowserAnnotationPayload,
  DEFAULT_BROWSER_ANNOTATION_PRIORITY
} from '../describe-page/browser-annotation-geometry'
import { useBrowserPageAnnotationViewportTracking } from './use-browser-page-annotation-viewport-tracking'
import { runBrowserGrabActionShortcut } from './browser-page-grab-action'
import { withSelectionAtAdd } from './read-pending-annotation-selected-text'
import { grabToastPosition } from './browser-grab-toast-position'
import { restoredBrowserAnnotationPayload } from '@/store/slices/browser/browser-annotation-drafts'
import type {
  BrowserPageGrabAnnotations,
  BrowserPageGrabAnnotationsOptions,
  BrowserPageGrabToastState,
  GrabIntent
} from '../describe-page/browser-page-types'

const copiedGrabToastMessage = (): string =>
  translate(
    'auto.components.browser.pane.annotate.use.browser.page.grab.annotations.0c7b9b2b7a',
    'Copied'
  )
const screenshottedGrabToastMessage = (): string =>
  translate(
    'auto.components.browser.pane.annotate.use.browser.page.grab.annotations.c937229f19',
    'Screenshotted'
  )
const annotationAddedGrabToastMessage = (): string =>
  translate(
    'auto.components.browser.pane.annotate.use.browser.page.grab.annotations.1f5cb19034',
    'Annotation added'
  )

export function useBrowserPageGrabAnnotations({
  browserTabId,
  toolTargetId = browserTabId,
  isActive,
  grab,
  containerRef,
  trackingContainer,
  trackingScroller,
  webviewRef,
  setBrowserOverlayViewport,
  browserAnnotationsLength
}: BrowserPageGrabAnnotationsOptions): BrowserPageGrabAnnotations {
  const mountedRef = useMountedRef()
  const toolTargetIdRef = useRef(toolTargetId)
  const grabToastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [grabIntent, setGrabIntent] = useState<GrabIntent>('copy')
  const grabIntentRef = useRef(grabIntent)
  // A draft left open when the pane last unmounted (its worktree went inactive) comes back
  // unanchored: the page may have scrolled or reloaded since, so its note is re-found by selector.
  const [pendingAnnotationPayload, setPendingAnnotationPayload] =
    useState<BrowserGrabPayload | null>(() => restoredBrowserAnnotationPayload(browserTabId))
  const pendingAnnotationPayloadRef = useRef<BrowserGrabPayload | null>(pendingAnnotationPayload)
  // The draft whose element went away with its document; compared by identity so a new pick re-anchors.
  const [unanchoredPendingPayload, setUnanchoredPendingPayload] =
    useState<BrowserGrabPayload | null>(pendingAnnotationPayload)
  const pendingAnnotationUnanchored =
    pendingAnnotationPayload !== null && pendingAnnotationPayload === unanchoredPendingPayload
  const unanchoredPendingPayloadRef = useRef<BrowserGrabPayload | null>(unanchoredPendingPayload)
  // Place the toast beside the selected element without covering it.
  const [grabToast, setGrabToast] = useState<BrowserPageGrabToastState | null>(null)
  const grabRef = useRef(grab)
  const grabPayloadRef = useRef(grab.payload)
  const browserAnnotationsLengthRef = useRef(browserAnnotationsLength)

  useLayoutEffect(() => {
    browserAnnotationsLengthRef.current = browserAnnotationsLength
    toolTargetIdRef.current = toolTargetId
    grabIntentRef.current = grabIntent
    pendingAnnotationPayloadRef.current = pendingAnnotationPayload
    grabRef.current = grab
    grabPayloadRef.current = grab.payload
  }, [browserAnnotationsLength, grab, grabIntent, pendingAnnotationPayload, toolTargetId])
  // Why: Radix fires onOpenChange(false) before onSelect, so this flag lets onOpenChange skip the rearm that would clear the payload first.
  const grabMenuActionTakenRef = useRef(false)
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)
  const addBrowserPageAnnotation = useAppStore((s) => s.addBrowserPageAnnotation)

  useEffect(() => () => clearTimeout(grabToastTimerRef.current), [])

  const dismissGrabToast = useCallback(() => {
    clearTimeout(grabToastTimerRef.current)
    setGrabToast(null)
    // Why: only rearm while 'confirming'; if a C/S shortcut already rearmed (state 'armed'), skip to avoid a double-rearm race.
    if (
      grabRef.current.state === 'confirming' &&
      !(grabIntentRef.current === 'annotate' && pendingAnnotationPayloadRef.current)
    ) {
      grabRef.current.rearm()
    }
  }, [])

  const showGrabToast = useCallback(
    (message: string, type: 'success' | 'error', payload?: BrowserGrabPayload | null) => {
      if (!mountedRef.current) {
        return
      }
      const position = grabToastPosition(
        payload?.target.rectViewport ?? null,
        containerRef.current?.getBoundingClientRect(),
        webviewRef.current?.getBoundingClientRect()
      )
      clearTimeout(grabToastTimerRef.current)
      setGrabToast({ message, type, ...position, payload: payload ?? null })
      grabToastTimerRef.current = setTimeout(() => dismissGrabToast(), 2000)
    },
    [containerRef, dismissGrabToast, mountedRef, webviewRef]
  )

  // The picker supports clipboard copying and independently dismissible annotation drafts.
  useEffect(() => {
    if (grab.state !== 'confirming' || !grab.payload) {
      return
    }
    if (grabIntent === 'annotate') {
      // The store refuses notes past the cap, so say so before the user writes one.
      if (
        grabPayloadRef.current === grab.payload &&
        isBrowserAnnotationPageFull(browserAnnotationsLengthRef.current)
      ) {
        showGrabToast(browserAnnotationLimitMessage(), 'error', grab.payload)
        return
      }
      // Loading may cancel the selection before React accepts this pending snapshot.
      setPendingAnnotationPayload(() =>
        grabPayloadRef.current === grab.payload ? grab.payload : null
      )
      // The live box measured for the previous selection must not place this one's card.
      setBrowserOverlayViewport((current) =>
        current.target ? { ...current, target: undefined } : current
      )
      return
    }
    if (!grab.contextMenu) {
      const text = formatGrabPayloadAsText(grab.payload)
      void window.api.ui.writeClipboardText(text)
      recordFeatureInteraction('browser-grab')
      showGrabToast(copiedGrabToastMessage(), 'success', grab.payload)
    }
  }, [
    grab.state,
    grab.payload,
    grab.contextMenu,
    grabIntent,
    recordFeatureInteraction,
    setBrowserOverlayViewport,
    showGrabToast
  ])

  useBrowserPageAnnotationViewportTracking({
    isActive,
    pendingAnnotation: pendingAnnotationUnanchored ? null : pendingAnnotationPayload,
    annotationCount: browserAnnotationsLength,
    container: trackingContainer ?? containerRef.current,
    scroller:
      trackingScroller ??
      containerRef.current?.querySelector<HTMLDivElement>('[data-browser-page-scroller]') ??
      null,
    setBrowserOverlayViewport
  })

  const startGrabIntent = useCallback(
    (nextIntent: GrabIntent): void => {
      recordFeatureInteraction('browser-grab')
      if (nextIntent === 'annotate') {
        recordFeatureInteraction('browser-annotations')
      }
      setGrabIntent(nextIntent)
      if (nextIntent === 'copy') {
        setPendingAnnotationPayload(null)
      }
      if (grab.state === 'idle' || grab.state === 'error' || grabIntent === nextIntent) {
        grab.toggle()
      }
    },
    [grab, grabIntent, recordFeatureInteraction]
  )

  // C / S copy the hovered element without clicking: extract via IPC while armed/awaiting, else use the captured payload.
  const handleGrabActionShortcut = useCallback(
    (key: 'c' | 's'): void => {
      runBrowserGrabActionShortcut({
        key,
        grabIntent,
        grab,
        grabPayloadRef,
        toolTargetIdRef,
        recordFeatureInteraction,
        showGrabToast
      })
    },
    [grab, grabIntent, recordFeatureInteraction, showGrabToast]
  )

  const handleGrabCopy = useCallback(() => {
    grabMenuActionTakenRef.current = true
    const payload = grabPayloadRef.current
    if (!payload) {
      return
    }
    const text = formatGrabPayloadAsText(payload)
    void window.api.ui.writeClipboardText(text)
    recordFeatureInteraction('browser-grab')
    showGrabToast(copiedGrabToastMessage(), 'success', payload)
    grab.rearm()
  }, [grab, recordFeatureInteraction, showGrabToast])

  const handleGrabCopyScreenshot = useCallback(() => {
    grabMenuActionTakenRef.current = true
    const payload = grabPayloadRef.current
    if (!payload) {
      return
    }
    const dataUrl = payload.screenshot?.dataUrl
    if (!dataUrl?.startsWith('data:image/png;base64,')) {
      return
    }
    void window.api.ui.writeClipboardImage(dataUrl)
    recordFeatureInteraction('browser-grab')
    showGrabToast(screenshottedGrabToastMessage(), 'success', payload)
    grab.rearm()
  }, [grab, recordFeatureInteraction, showGrabToast])

  const handleAddBrowserAnnotation = useCallback(
    async (comment: string, intent: BrowserAnnotationIntent, imagePaths: string[] = []) => {
      const payload = pendingAnnotationPayloadRef.current
      if (!payload) {
        return
      }
      // A draft kept across a reload has old geometry; the note is found again by selector.
      const measured = payload !== unanchoredPendingPayloadRef.current
      // Only a live pick can read a selection made after the click.
      const latest = measured ? await withSelectionAtAdd(toolTargetIdRef.current, payload) : payload
      // A cancel or a second Add during the read has already settled this draft.
      if (pendingAnnotationPayloadRef.current !== payload) {
        return
      }
      addBrowserPageAnnotation(
        {
          id: createBrowserAnnotationId(),
          browserPageId: browserTabId,
          comment,
          intent,
          priority: DEFAULT_BROWSER_ANNOTATION_PRIORITY,
          createdAt: new Date().toISOString(),
          payload: createBrowserAnnotationPayload(latest),
          ...(imagePaths.length > 0 ? { imagePaths } : {})
        },
        { measured }
      )
      recordFeatureInteraction('browser-annotations')
      pendingAnnotationPayloadRef.current = null
      setPendingAnnotationPayload(null)
      showGrabToast(annotationAddedGrabToastMessage(), 'success', measured ? payload : null)
      // The reload already ended that pick; re-arming would start one the user did not ask for.
      if (measured) {
        grab.rearm()
      }
    },
    [addBrowserPageAnnotation, browserTabId, grab, recordFeatureInteraction, showGrabToast]
  )

  const handleCancelPendingBrowserAnnotation = useCallback((): void => {
    pendingAnnotationPayloadRef.current = null
    setPendingAnnotationPayload(null)
    if (grabIntent === 'annotate' && grab.state === 'confirming') {
      grab.rearm()
    }
  }, [grab, grabIntent])

  const cancelPendingBrowserCapture = useCallback((): void => {
    grabRef.current.cancel()
    pendingAnnotationPayloadRef.current = null
    grabPayloadRef.current = null
    setPendingAnnotationPayload(null)
    clearTimeout(grabToastTimerRef.current)
    setGrabToast(null)
  }, [])

  /** Keeps the draft (and its typed comment) when its document goes away; the card then floats unanchored. */
  const detachPendingBrowserCapture = useCallback((): void => {
    const pending = pendingAnnotationPayloadRef.current
    cancelPendingBrowserCapture()
    if (pending) {
      pendingAnnotationPayloadRef.current = pending
      unanchoredPendingPayloadRef.current = pending
      setPendingAnnotationPayload(pending)
      setUnanchoredPendingPayload(pending)
    }
  }, [cancelPendingBrowserCapture])

  return {
    grabIntent,
    startGrabIntent,
    pendingAnnotationPayload,
    pendingAnnotationUnanchored,
    setPendingAnnotationPayload,
    grabToast,
    setGrabToast,
    grabToastTimerRef,
    dismissGrabToast,
    handleGrabCopy,
    handleGrabCopyScreenshot,
    grabMenuActionTakenRef,
    handleAddBrowserAnnotation,
    handleCancelPendingBrowserAnnotation,
    cancelPendingBrowserCapture,
    detachPendingBrowserCapture,
    handleGrabActionShortcut
  }
}
