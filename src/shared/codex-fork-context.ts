export const CODEX_FORK_UNAVAILABLE_REASONS = [
  'not-local',
  'source-account-unavailable',
  'unsupported-cli'
] as const

export type CodexForkUnavailableReason = (typeof CODEX_FORK_UNAVAILABLE_REASONS)[number]

export type CodexForkContext =
  | {
      status: 'available'
      env?: Record<string, string>
    }
  | {
      status: 'unavailable'
      reason: CodexForkUnavailableReason
    }
