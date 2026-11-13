import { useCallback, useEffect, useState } from 'react'
import type { BrowserGrabPayload } from '../../../../../shared/browser-grab-types'
import {
  deleteBrowserAnnotationDrafts,
  getBrowserAnnotationDraft,
  setBrowserAnnotationDraftPayload,
  updateBrowserAnnotationDraftText,
  type BrowserAnnotationDraftText
} from '@/store/slices/browser/browser-annotation-drafts'
import { createBrowserAnnotationPayload } from '../describe-page/browser-annotation-geometry'

/**
 * Keeps the page's pending annotation draft in the draft registry, so it outlives the pane's
 * unmount when its worktree goes inactive; returns the text to seed a card restored from it.
 */
export function useBrowserAnnotationDraftSync(
  pageId: string,
  pendingPayload: BrowserGrabPayload | null
): {
  initialDraft: BrowserAnnotationDraftText | undefined
  onDraftChange: (text: BrowserAnnotationDraftText) => void
} {
  // Read in the same render as the grab hook's restored payload, so identity tells them apart from a new pick.
  const [restored] = useState(() => getBrowserAnnotationDraft(pageId))
  // Unmounting runs no effect, so the draft survives; clearing it (Add, Cancel) or closing the page drops it.
  useEffect(() => {
    if (pendingPayload) {
      setBrowserAnnotationDraftPayload(pageId, createBrowserAnnotationPayload(pendingPayload))
    } else {
      deleteBrowserAnnotationDrafts([pageId])
    }
  }, [pageId, pendingPayload])
  const onDraftChange = useCallback(
    (text: BrowserAnnotationDraftText): void => updateBrowserAnnotationDraftText(pageId, text),
    [pageId]
  )
  const initialDraft =
    restored && pendingPayload === restored.payload
      ? { comment: restored.comment, intent: restored.intent, imagePaths: restored.imagePaths }
      : undefined
  return { initialDraft, onDraftChange }
}
