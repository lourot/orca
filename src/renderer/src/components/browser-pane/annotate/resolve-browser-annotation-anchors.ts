import { useEffect } from 'react'
import { useAppStore } from '@/store'
import {
  MAX_BROWSER_ANNOTATION_ANCHORS,
  type BrowserAnnotationAnchorRequest,
  type BrowserResolvedAnnotationAnchor
} from '../../../../../shared/browser-annotation-anchor-resolution'
import { GRAB_BUDGET } from '../../../../../shared/browser-grab-types'
import { browserAnnotationMatchesPageUrl } from './browser-annotation-page-url'

const generationByPageId = new Map<string, number>()
// Client-rendered pages and guests still registering have no elements yet when loading settles.
const ATTEMPT_DELAYS_MS = [0, 500, 1500, 4000]

/** Drops any resolution still in flight for the page's previous document. */
export function retireBrowserAnnotationAnchorResolution(pageId: string): void {
  generationByPageId.set(pageId, (generationByPageId.get(pageId) ?? 0) + 1)
}

/**
 * Re-finds, by their captured selector, the page's notes that have no live geometry in the
 * current document, so their badges come back after a reload, a navigation or a restart.
 * `currentUrl` limits it to notes taken on this URL; omit it where the URL says nothing (previews).
 */
export async function resolveBrowserAnnotationAnchors({
  pageId,
  toolTargetId,
  currentUrl
}: {
  pageId: string
  toolTargetId: string
  currentUrl?: string
}): Promise<void> {
  const resolve = window.api?.browser?.resolveAnnotationAnchors
  if (!toolTargetId || typeof resolve !== 'function') {
    return
  }
  retireBrowserAnnotationAnchorResolution(pageId)
  const generation = generationByPageId.get(pageId)
  const state = useAppStore.getState()
  const liveIds = new Set(state.browserAnnotationMarkerIdsByPageId[pageId] ?? [])
  const requests: BrowserAnnotationAnchorRequest[] = (
    state.browserAnnotationsByPageId[pageId] ?? []
  )
    .filter(
      (note) =>
        !liveIds.has(note.id) &&
        note.payload.target.selector.length > 0 &&
        note.payload.target.selector.length <= GRAB_BUDGET.selectorMaxLength &&
        (currentUrl === undefined ||
          browserAnnotationMatchesPageUrl(note.payload.page.sanitizedUrl, currentUrl))
    )
    .slice(0, MAX_BROWSER_ANNOTATION_ANCHORS)
    .map((note) => ({ id: note.id, selector: note.payload.target.selector }))
  if (requests.length === 0) {
    useAppStore.getState().setBrowserAnnotationAnchors(pageId, [])
    return
  }
  for (const [attempt, delayMs] of ATTEMPT_DELAYS_MS.entries()) {
    if (delayMs > 0) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs))
    }
    if (generationByPageId.get(pageId) !== generation) {
      return
    }
    const anchors = await resolve({ browserPageId: toolTargetId, anchors: requests }).catch(
      () => []
    )
    if (generationByPageId.get(pageId) !== generation) {
      return
    }
    const complete = anchors.length === requests.length
    // Publishing an empty result early would flag every note "not found" while the page renders.
    if (anchors.length > 0 || complete || attempt === ATTEMPT_DELAYS_MS.length - 1) {
      useAppStore.getState().setBrowserAnnotationAnchors(pageId, anchors)
    }
    if (complete) {
      return
    }
  }
}

/**
 * Resolves on each settled document and whenever the page gains notes without live geometry
 * (reattached, or drafted before a reload); returns the page's anchors.
 */
export function useBrowserAnnotationAnchorResolution(
  pageId: string,
  settled: boolean,
  currentUrl?: string,
  toolTargetId = pageId
): Record<string, BrowserResolvedAnnotationAnchor> | undefined {
  // Optional reads: pane suites mock partial stores without these maps.
  const unmeasuredNoteIds = useAppStore((s) => {
    const live = new Set(s.browserAnnotationMarkerIdsByPageId?.[pageId] ?? [])
    return (s.browserAnnotationsByPageId?.[pageId] ?? [])
      .filter((note) => !live.has(note.id))
      .map((note) => note.id)
      .join('\n')
  })
  useEffect(() => {
    if (settled && unmeasuredNoteIds) {
      void resolveBrowserAnnotationAnchors({ pageId, toolTargetId, currentUrl })
    }
  }, [currentUrl, pageId, settled, toolTargetId, unmeasuredNoteIds])
  return useAppStore((s) => s.browserAnnotationAnchorsByPageId?.[pageId])
}

/** Ids of the page's notes measured in its current document. */
export function useBrowserAnnotationMarkerIds(pageId: string): string[] | undefined {
  return useAppStore((s) => s.browserAnnotationMarkerIdsByPageId?.[pageId])
}
