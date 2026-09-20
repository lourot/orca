import { describe, expect, it } from 'vitest'
import {
  CODEX_ATTENTION_QUIET_MS,
  isCodexPermissionBellWithinQuietWindow,
  resolveCodexApprovalReviewer,
  shouldSuppressCodexAutoReviewPermissionAttention
} from './codex-auto-review-attention'

describe('Codex auto-review attention policy', () => {
  it.each([
    ['--approve-for-me', 'auto_review'],
    ['--config approvals_reviewer=auto_review', 'auto_review'],
    ['-c approvals_reviewer=user', 'user'],
    ['--config approvals_reviewer=guardian_subagent', 'guardian_subagent']
  ])('resolves %s as %s', (agentArgs, reviewer) => {
    expect(resolveCodexApprovalReviewer({ agentArgs })).toBe(reviewer)
  })

  it('suppresses only verified auto-review permission requests', () => {
    expect(
      shouldSuppressCodexAutoReviewPermissionAttention({
        agentType: 'codex',
        state: 'waiting',
        toolName: 'shell',
        hookEventName: 'PermissionRequest',
        reviewer: 'auto_review'
      })
    ).toBe(true)
    expect(
      shouldSuppressCodexAutoReviewPermissionAttention({
        agentType: 'codex',
        state: 'waiting',
        toolName: 'request_user_input',
        hookEventName: 'PermissionRequest',
        reviewer: 'auto_review'
      })
    ).toBe(false)
    expect(
      shouldSuppressCodexAutoReviewPermissionAttention({
        agentType: 'codex',
        state: 'waiting',
        toolName: 'shell',
        hookEventName: 'PermissionRequest',
        reviewer: 'user'
      })
    ).toBe(false)
    expect(
      shouldSuppressCodexAutoReviewPermissionAttention({
        agentType: 'codex',
        state: 'waiting',
        toolName: 'shell',
        hookEventName: 'PreToolUse',
        reviewer: 'auto_review'
      })
    ).toBe(false)
  })

  it('holds only fresh non-question Codex permission BELs', () => {
    const updatedAt = 1_000
    const status = {
      agentType: 'codex' as const,
      state: 'waiting' as const,
      toolName: 'shell',
      updatedAt
    }

    expect(isCodexPermissionBellWithinQuietWindow(status, updatedAt)).toBe(true)
    expect(
      isCodexPermissionBellWithinQuietWindow(status, updatedAt + CODEX_ATTENTION_QUIET_MS)
    ).toBe(false)
    expect(
      isCodexPermissionBellWithinQuietWindow(
        { ...status, toolName: 'request_user_input' },
        updatedAt
      )
    ).toBe(false)
  })
})
