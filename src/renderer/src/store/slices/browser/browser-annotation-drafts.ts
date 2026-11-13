import {
  DEFAULT_BROWSER_ANNOTATION_PRIORITY,
  type BrowserAnnotationIntent,
  type BrowserAnnotationPayload,
  type BrowserPageAnnotation
} from '../../../../../shared/browser-grab-types'
import { createBrowserUuid } from '@/lib/browser-uuid'

export type BrowserAnnotationDraftText = {
  comment: string
  intent: BrowserAnnotationIntent
  imagePaths: string[]
}

export type BrowserAnnotationDraft = BrowserAnnotationDraftText & {
  payload: BrowserAnnotationPayload
}

// Why: the page's chrome unmounts when its worktree goes inactive; nothing renders from a draft,
// so a plain map (not store state) carries it across that remount without a store write per keystroke.
const draftsByPageId = new Map<string, BrowserAnnotationDraft>()

/** Starts (or re-targets) the page's draft, keeping any text already typed. */
export function setBrowserAnnotationDraftPayload(
  pageId: string,
  payload: BrowserAnnotationPayload
): void {
  const current = draftsByPageId.get(pageId)
  draftsByPageId.set(pageId, {
    comment: current?.comment ?? '',
    intent: current?.intent ?? 'change',
    imagePaths: current?.imagePaths ?? [],
    payload
  })
}

export function updateBrowserAnnotationDraftText(
  pageId: string,
  text: BrowserAnnotationDraftText
): void {
  const current = draftsByPageId.get(pageId)
  if (current) {
    draftsByPageId.set(pageId, { ...current, ...text })
  }
}

export function getBrowserAnnotationDraft(pageId: string): BrowserAnnotationDraft | undefined {
  return draftsByPageId.get(pageId)
}

/** The element of the page's waiting draft, to reopen its card after the pane remounts. */
export function restoredBrowserAnnotationPayload(pageId: string): BrowserAnnotationPayload | null {
  return draftsByPageId.get(pageId)?.payload ?? null
}

export function deleteBrowserAnnotationDrafts(pageIds: readonly string[]): void {
  for (const pageId of pageIds) {
    draftsByPageId.delete(pageId)
  }
}

/** The page's notes plus its typed draft as a note, so closing the page keeps the draft too. */
export function browserAnnotationsWithDraft(
  pageId: string,
  annotations: BrowserPageAnnotation[] | undefined
): BrowserPageAnnotation[] | undefined {
  const draft = draftsByPageId.get(pageId)
  const comment = draft?.comment.trim()
  if (!draft || !comment) {
    return annotations
  }
  const note: BrowserPageAnnotation = {
    id: `browser-annotation-${createBrowserUuid()}`,
    browserPageId: pageId,
    comment,
    intent: draft.intent,
    priority: DEFAULT_BROWSER_ANNOTATION_PRIORITY,
    createdAt: new Date().toISOString(),
    payload: draft.payload,
    ...(draft.imagePaths.length > 0 ? { imagePaths: draft.imagePaths } : {})
  }
  return [...(annotations ?? []), note]
}
