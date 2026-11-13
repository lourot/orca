import type { DetachedBrowserNoteGroup } from '../../../../../shared/browser-detached-annotation-schema'
import { GRAB_BUDGET, type BrowserPageAnnotation } from '../../../../../shared/browser-grab-types'
import type { BrowserPage } from '../../../../../shared/browser-workspace-types'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { BrowserSlice, BrowserSliceGet, BrowserSliceSet } from './browser-slice-contract'
import { findPage } from '../browser-page-records'
import { rehomeBrowserPageAnnotations } from './browser-page-annotation'
import { afterPendingEntityTabs } from '@/runtime/layout-owner-pending-tabs'
import { browserAnnotationsWithDraft } from './browser-annotation-drafts'

type DetachedNotesState = Pick<
  BrowserSlice,
  'detachedBrowserAnnotationsByWorktree' | 'browserAnnotationsByPageId'
>

/** One group per closed page that still holds unsent notes, a typed draft included. */
export function detachedNoteGroupsForClosedPages(
  pages: readonly BrowserPage[],
  annotationsByPageId: Record<string, BrowserPageAnnotation[]>,
  now = Date.now()
): DetachedBrowserNoteGroup[] {
  return pages.flatMap((page) => {
    const annotations = browserAnnotationsWithDraft(page.id, annotationsByPageId[page.id])
    if (!annotations?.length) {
      return []
    }
    return [
      {
        id: createBrowserUuid(),
        detachedAt: now,
        origin: {
          pageId: page.id,
          workspaceId: page.workspaceId,
          url: page.url,
          title: page.title,
          ...(page.docLocation ? { docLocation: page.docLocation } : {})
        },
        annotations
      }
    ]
  })
}

/** Adds groups to a worktree's detached notes; returns the input when there is nothing to add. */
export function withDetachedNoteGroups(
  byWorktree: Record<string, DetachedBrowserNoteGroup[]>,
  worktreeId: string,
  groups: readonly DetachedBrowserNoteGroup[]
): Record<string, DetachedBrowserNoteGroup[]> {
  if (groups.length === 0) {
    return byWorktree
  }
  return { ...byWorktree, [worktreeId]: [...groups, ...(byWorktree[worktreeId] ?? [])] }
}

/**
 * Moves detached groups back onto live pages. `targetPageIdFor` names each group's page, or null
 * to leave it detached. A page takes notes only up to its cap; the rest stay detached.
 */
export function attachDetachedNoteGroups(
  s: DetachedNotesState,
  worktreeId: string,
  targetPageIdFor: (group: DetachedBrowserNoteGroup) => string | null
): Partial<DetachedNotesState> | null {
  const groups = s.detachedBrowserAnnotationsByWorktree[worktreeId] ?? []
  const annotationsByPageId = { ...s.browserAnnotationsByPageId }
  const remaining: DetachedBrowserNoteGroup[] = []
  let changed = false
  for (const group of groups) {
    const pageId = targetPageIdFor(group)
    if (!pageId) {
      remaining.push(group)
      continue
    }
    const existing = annotationsByPageId[pageId] ?? []
    const room = Math.max(0, GRAB_BUDGET.annotationsMaxPerPage - existing.length)
    const moved = group.annotations.slice(0, room)
    const left = group.annotations.slice(room)
    if (moved.length > 0) {
      annotationsByPageId[pageId] = [...existing, ...rehomeBrowserPageAnnotations(moved, pageId)]
      changed = true
    }
    if (left.length > 0) {
      remaining.push(moved.length > 0 ? { ...group, annotations: left } : group)
    }
  }
  if (!changed) {
    return null
  }
  const byWorktree = { ...s.detachedBrowserAnnotationsByWorktree }
  if (remaining.length > 0) {
    byWorktree[worktreeId] = remaining
  } else {
    delete byWorktree[worktreeId]
  }
  return {
    browserAnnotationsByPageId: annotationsByPageId,
    detachedBrowserAnnotationsByWorktree: byWorktree
  }
}

export function createBrowserDetachedAnnotationActions(
  set: BrowserSliceSet,
  get: BrowserSliceGet
): Pick<
  BrowserSlice,
  'reattachDetachedBrowserNotes' | 'discardDetachedBrowserNotes' | 'reopenDetachedBrowserNotes'
> {
  const reattach: BrowserSlice['reattachDetachedBrowserNotes'] = (worktreeId, groupId, pageId) => {
    set((s) => {
      if (!findPage(s.browserPagesByWorkspace, pageId)) {
        return s
      }
      return (
        attachDetachedNoteGroups(s, worktreeId, (group) =>
          group.id === groupId ? pageId : null
        ) ?? s
      )
    })
  }
  return {
    reattachDetachedBrowserNotes: reattach,

    discardDetachedBrowserNotes: (worktreeId, groupId) =>
      set((s) => {
        const groups = s.detachedBrowserAnnotationsByWorktree[worktreeId] ?? []
        const next = groups.filter((group) => group.id !== groupId)
        if (next.length === groups.length) {
          return s
        }
        const byWorktree = { ...s.detachedBrowserAnnotationsByWorktree }
        if (next.length > 0) {
          byWorktree[worktreeId] = next
        } else {
          delete byWorktree[worktreeId]
        }
        return { detachedBrowserAnnotationsByWorktree: byWorktree }
      }),

    reopenDetachedBrowserNotes: (worktreeId, groupId) => {
      const group = get().detachedBrowserAnnotationsByWorktree[worktreeId]?.find(
        (entry) => entry.id === groupId
      )
      if (!group) {
        return null
      }
      const tab = get().createBrowserTab(worktreeId, group.origin.url, {
        title: group.origin.title,
        activate: true,
        ...(group.origin.docLocation ? { docLocation: group.origin.docLocation } : {})
      })
      // A layout-owner build adds the page once main drew the tab.
      afterPendingEntityTabs(worktreeId, tab.id, () => {
        const pageId = get().browserPagesByWorkspace[tab.id]?.[0]?.id
        if (pageId) {
          reattach(worktreeId, groupId, pageId)
        }
      })
      return tab
    }
  }
}
