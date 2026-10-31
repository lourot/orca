export const AGENT_MESSAGE_LOG_RETENTION_DAYS = 14
export const AGENT_MESSAGE_LOG_RETENTION_MS = AGENT_MESSAGE_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
export const AGENT_MESSAGE_LOG_LIST_MAX = 500

export type AgentMessageLogSettings = {
  /** Only toggles the sidebar shortcut; Settings and the View menu bring it back. */
  showMessagesButton?: boolean
}

export type AgentMessageLogOutcome = 'accepted' | 'refused' | 'error'

/** One `orca terminal send` from the CLI, with its target as it was when sent. */
export type AgentMessageLogEntry = {
  id: number
  sentAt: number
  text: string
  outcome: AgentMessageLogOutcome
  refusedReason: string | null
  targetHandle: string
  // Null when the target terminal could not be resolved at send time.
  worktreeId: string | null
  worktreePath: string | null
  branch: string | null
  terminalTitle: string | null
  // Observed agent id (e.g. `claude`), display only.
  agent: string | null
}

export type AgentMessageLogListResult = {
  entries: AgentMessageLogEntry[]
  retentionDays: number
}
