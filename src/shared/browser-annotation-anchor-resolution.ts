import { GRAB_BUDGET, type BrowserGrabRect } from './browser-grab-types'
import { isValidBrowserGrabRect } from './browser-annotation-viewport-report'

/** A saved note's element, found again by the selector captured with it. */
export type BrowserAnnotationAnchorRequest = { id: string; selector: string }

export type BrowserResolveAnnotationAnchorsArgs = {
  browserPageId: string
  anchors: BrowserAnnotationAnchorRequest[]
}

export type BrowserResolvedAnnotationAnchor = {
  id: string
  rectPage: BrowserGrabRect
  rectViewport: BrowserGrabRect
  isFixed: boolean
}

export const MAX_BROWSER_ANNOTATION_ANCHORS = GRAB_BUDGET.annotationsMaxPerPage

export function isValidBrowserAnnotationAnchorRequests(
  value: unknown
): value is BrowserAnnotationAnchorRequest[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_BROWSER_ANNOTATION_ANCHORS &&
    value.every(
      (anchor: unknown) =>
        !!anchor &&
        typeof anchor === 'object' &&
        'id' in anchor &&
        'selector' in anchor &&
        typeof anchor.id === 'string' &&
        anchor.id.length > 0 &&
        anchor.id.length <= 100 &&
        typeof anchor.selector === 'string' &&
        anchor.selector.length > 0 &&
        anchor.selector.length <= GRAB_BUDGET.selectorMaxLength
    )
  )
}

/**
 * Read-only guest script: measures each selector's single match and returns numbers only.
 * Inputs are JSON-encoded, so a selector cannot break out of its string.
 */
export function buildResolveBrowserAnnotationAnchorsScript(
  anchors: readonly BrowserAnnotationAnchorRequest[]
): string {
  return `(() => {
  'use strict';
  const anchors = ${JSON.stringify(anchors)};
  const isFixed = (el) => {
    let current = el;
    while (current && current !== document.body) {
      const position = getComputedStyle(current).position;
      if (position === 'fixed' || position === 'sticky') return true;
      current = current.parentElement;
    }
    return false;
  };
  const found = [];
  for (const anchor of anchors) {
    let matches;
    try {
      matches = document.querySelectorAll(anchor.selector);
    } catch (e) {
      continue;
    }
    // An ambiguous selector no longer names the noted element.
    if (matches.length !== 1) continue;
    const rect = matches[0].getBoundingClientRect();
    found.push({
      id: anchor.id,
      isFixed: isFixed(matches[0]),
      rectViewport: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      rectPage: { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height }
    });
  }
  return found;
})()`
}

/** Keeps only well-formed anchors for ids that were asked for; the guest is untrusted. */
export function parseResolvedBrowserAnnotationAnchors(
  raw: unknown,
  requested: readonly BrowserAnnotationAnchorRequest[]
): BrowserResolvedAnnotationAnchor[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const requestedIds = new Set(requested.map((anchor) => anchor.id))
  const seen = new Set<string>()
  const anchors: BrowserResolvedAnnotationAnchor[] = []
  for (const entry of raw.slice(0, MAX_BROWSER_ANNOTATION_ANCHORS)) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.id !== 'string' ||
      !requestedIds.has(entry.id) ||
      seen.has(entry.id) ||
      typeof entry.isFixed !== 'boolean' ||
      !isValidBrowserGrabRect(entry.rectPage) ||
      !isValidBrowserGrabRect(entry.rectViewport)
    ) {
      continue
    }
    seen.add(entry.id)
    anchors.push({
      id: entry.id,
      isFixed: entry.isFixed,
      rectPage: pickRect(entry.rectPage),
      rectViewport: pickRect(entry.rectViewport)
    })
  }
  return anchors
}

function pickRect(rect: BrowserGrabRect): BrowserGrabRect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}
