/** Request/result contract for regenerating an agent tab's rolling title from
 *  its latest finished turn. Shared so main, preload and the web shim agree. */
export type RollingAgentTitleArgs = {
  worktreePath: string
  /** Raw (unstripped) worktree meta key; validated against worktreePath in main. */
  worktreeId?: string
  repoId?: string
  connectionId?: string
  prompt: string
  assistantMessage?: string
}

export type RollingAgentTitleResult =
  | { success: true; title: string }
  | { success: false; error: string }
