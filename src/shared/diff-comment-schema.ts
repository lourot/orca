import { z } from 'zod'

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
