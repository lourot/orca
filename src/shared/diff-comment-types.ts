// Persist line review notes on WorktreeMeta for existing orca-data.json storage and later agent handoff.
import type { DiffComparison } from './diff-comparison'

// 'file' = authored in the plain editor on a non-markdown file; 'markdown' keeps
// its own value because the rendered-markdown surfaces only handle that one.
export type DiffCommentSource = 'diff' | 'markdown' | 'file'
export type DiffReviewScope = 'unstaged' | 'staged' | 'branch'

export type MobileDiffReviewFileState = {
  key: string
  filePath: string
  oldPath?: string
  scope: DiffReviewScope
  lastOpenedAt?: number
  lastSeenDiffIdentity?: string
  reviewedAt?: number
  reviewDiffIdentity?: string
}

export type MobileDiffReviewState = {
  version: 1
  updatedAt?: number
  completedAt?: number
  files: Record<string, MobileDiffReviewFileState>
}

export type DiffComment = {
  id: string
  worktreeId: string
  filePath: string
  /** Undefined means a legacy diff note. */
  source?: DiffCommentSource
  /** Exact text selected when creating a markdown note, when available. */
  selectedText?: string
  /**
   * The quoted source line(s) this note was anchored to, captured at creation.
   * Batched prompts have no file content to derive an excerpt from, and a line
   * number alone is near-useless in a generated or very large file.
   */
  anchorExcerpt?: string
  /** Inclusive range start. Must be <= lineNumber when present. */
  startLine?: number
  lineNumber: number
  body: string
  createdAt: number
  updatedAt?: number
  /** Set after the note has been handed to an agent. Edits clear it. */
  sentAt?: number
  scope?: DiffReviewScope
  /**
   * The git comparison this note was written against, captured at creation.
   * Undefined on legacy, mobile and plain-file notes. Kept separate from
   * `scope`, which mobile's queue filters on and which cannot express a commit.
   */
  reviewedComparison?: DiffComparison
  oldPath?: string
  diffIdentity?: string
  // Reserved for future "comments on the original side" — always 'modified' in v1.
  side: 'modified'
}

/**
 * A review note anchored to the workspace rather than a file: a todo to hand to an agent later.
 * Stored in its own `generalNotes` list because clients that predate it drop file-less entries from
 * `diffComments` and write the trimmed list back.
 */
export type GeneralNote = {
  id: string
  worktreeId: string
  body: string
  createdAt: number
  updatedAt?: number
  /**
   * Reserved, as on DiffComment: Send notes deletes delivered notes today. Kept in the schema so a
   * client that marks notes sent instead is not stripped by hosts that know this type.
   */
  sentAt?: number
  /** Never set: lets `isGeneralNote` tell the two kinds apart, since a DiffComment is otherwise a GeneralNote. */
  filePath?: never
}

/** Any note the Send notes batch can carry. */
export type ReviewNote = DiffComment | GeneralNote

// Why `=== undefined`, not `in`: a spread that writes `filePath: undefined` must not turn a general note into a file note.
export function isGeneralNote(note: ReviewNote): note is GeneralNote {
  return note.filePath === undefined
}
