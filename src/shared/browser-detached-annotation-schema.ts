import { z } from 'zod'
import type { BrowserPageAnnotation } from './browser-grab-types'
import type { BrowserPageDocLocation } from './browser-workspace-types'
import { browserPageAnnotationSchema } from './browser-page-annotation-schema'
import { browserPageDocLocationSchema } from './workspace-session-browser-schema'
import { salvagingArray } from './zod-salvage'

/** Unsent notes of a page that was closed; they stay on the worktree until reattached or discarded. */
export type DetachedBrowserNoteGroup = {
  id: string
  detachedAt: number
  origin: {
    pageId: string
    workspaceId: string
    url: string
    title: string
    docLocation?: BrowserPageDocLocation | null
  }
  annotations: BrowserPageAnnotation[]
}

export const detachedBrowserNoteGroupSchema: z.ZodType<DetachedBrowserNoteGroup> = z.object({
  id: z.string(),
  detachedAt: z.number(),
  origin: z.object({
    pageId: z.string(),
    workspaceId: z.string(),
    url: z.string(),
    title: z.string(),
    docLocation: browserPageDocLocationSchema.nullable().optional()
  }),
  annotations: salvagingArray(browserPageAnnotationSchema)
})
