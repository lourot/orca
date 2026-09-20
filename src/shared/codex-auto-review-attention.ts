import { isAskUserQuestionTool } from './agent-question-answered-intent'
import type { AgentStatusEntry, AgentStatusState } from './agent-status-types'

export const CODEX_ATTENTION_QUIET_MS = 10_000

export type CodexApprovalReviewer = 'user' | 'auto_review' | 'guardian_subagent'

export type CodexLaunchPermissionConfig = {
  agentArgs?: string | null
}

function reviewerFromValue(value: string | undefined): CodexApprovalReviewer | undefined {
  const normalized = value?.trim().toLowerCase()
  return normalized === 'user' || normalized === 'auto_review' || normalized === 'guardian_subagent'
    ? normalized
    : undefined
}

/** Resolves the explicit Codex reviewer marker from launch-owned configuration. */
export function resolveCodexApprovalReviewer(
  config: CodexLaunchPermissionConfig | null | undefined
): CodexApprovalReviewer | undefined {
  const args = (config?.agentArgs ?? '').replaceAll(/["']/g, ' ')
  const reviewerMatch = args.match(
    /(?:^|\s)(?:--approvals-reviewer(?:=|\s+)|(?:--config|-c)(?:=|\s+)approvals_reviewer=|approvals_reviewer=)(user|auto_review|guardian_subagent)(?=\s|$)/i
  )
  const reviewer = reviewerFromValue(reviewerMatch?.[1])
  if (reviewer) {
    return reviewer
  }

  return /(?:^|\s)--approve-for-me(?=\s|$)/i.test(args) ? 'auto_review' : undefined
}

/** True only for a Codex permission hook that the verified auto-reviewer owns. */
export function shouldSuppressCodexAutoReviewPermissionAttention(args: {
  agentType: string | null | undefined
  state: AgentStatusState
  toolName?: string
  hookEventName?: string
  reviewer?: CodexApprovalReviewer
}): boolean {
  return (
    args.agentType === 'codex' &&
    (args.state === 'waiting' || args.state === 'blocked') &&
    args.hookEventName === 'PermissionRequest' &&
    args.reviewer === 'auto_review' &&
    !isAskUserQuestionTool(args.toolName)
  )
}

/** True while a renderer-observed Codex permission wait is still inside its attention delay. */
export function isCodexPermissionBellWithinQuietWindow(
  status:
    | Pick<AgentStatusEntry, 'agentType' | 'state' | 'toolName' | 'updatedAt'>
    | null
    | undefined,
  now = Date.now()
): boolean {
  return Boolean(
    status?.agentType === 'codex' &&
    (status.state === 'waiting' || status.state === 'blocked') &&
    !isAskUserQuestionTool(status.toolName) &&
    now - status.updatedAt >= 0 &&
    now - status.updatedAt < CODEX_ATTENTION_QUIET_MS
  )
}
