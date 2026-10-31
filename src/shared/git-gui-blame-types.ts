import type { ExecutionHostId } from './execution-host'

export type GitGuiBlameRequest = {
  /** Absolute path of the file to blame. */
  filePath: string
  /** Absolute path of the git worktree holding it; git gui runs there. */
  worktreePath: string
  ownerHostId: ExecutionHostId
}

export type GitGuiBlameResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'remote-runtime-unsupported'
        | 'not-absolute'
        | 'not-found'
        | 'outside-worktree'
        | 'launch-failed'
    }
