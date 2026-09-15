import { z } from 'zod'

export const MobileDiffReviewSchema = z.object({
  version: z.literal(1),
  updatedAt: z.number().finite().optional(),
  completedAt: z.number().finite().optional(),
  files: z.record(
    z.string(),
    z.object({
      key: z.string(),
      filePath: z.string(),
      oldPath: z.string().optional(),
      scope: z.enum(['unstaged', 'staged', 'branch']),
      lastOpenedAt: z.number().finite().optional(),
      lastSeenDiffIdentity: z.string().optional(),
      reviewedAt: z.number().finite().optional(),
      reviewDiffIdentity: z.string().optional()
    })
  )
})

// Why: z.object strips unknown keys, so every persisted DiffComment field must
// be listed here or the folder-workspace write path silently drops it.
const DiffComparisonSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('uncommitted'),
    compares: z.enum(['worktree-vs-head', 'worktree-vs-index', 'index-vs-head'])
  }),
  z.object({
    kind: z.literal('branch'),
    baseRef: z.string(),
    compareRef: z.string(),
    mergeBase: z.string(),
    headOid: z.string()
  }),
  z.object({
    kind: z.literal('commit'),
    commitOid: z.string(),
    parentOid: z.string().optional()
  })
])

export const DiffCommentSchema = z.object({
  id: z.string(),
  worktreeId: z.string(),
  filePath: z.string(),
  source: z.enum(['diff', 'markdown', 'file']).optional(),
  selectedText: z.string().optional(),
  anchorExcerpt: z.string().optional(),
  startLine: z.number().int().positive().optional(),
  lineNumber: z.number().int().positive(),
  body: z.string(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite().optional(),
  sentAt: z.number().finite().optional(),
  scope: z.enum(['unstaged', 'staged', 'branch']).optional(),
  reviewedComparison: DiffComparisonSchema.optional(),
  oldPath: z.string().optional(),
  diffIdentity: z.string().optional(),
  side: z.literal('modified')
})

export const GeneralNoteSchema = z.object({
  id: z.string(),
  worktreeId: z.string(),
  body: z.string(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite().optional(),
  sentAt: z.number().finite().optional()
})
