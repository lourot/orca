// ─── Diff line comments ──────────────────────────────────────────────
// Why: users leave review notes on specific lines of the modified side of
// a diff so they can be handed back to an AI agent (pasted into a terminal
// or used to bootstrap a new agent session). Stored on WorktreeMeta so the
// existing persistence layer writes them to orca-data.json automatically.
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
