import type { AgentHookSource } from '../../agent-hook-relay'
import { readString } from '../tool-input-preview'

/** True for a Claude PermissionRequest raised in auto mode, whose dialog can time out without a hook. */
export function readClaudePromptTimesOut(
  source: AgentHookSource,
  eventName: unknown,
  hookPayload: Record<string, unknown>
): true | undefined {
  return source === 'claude' &&
    eventName === 'PermissionRequest' &&
    readString(hookPayload, 'permission_mode') === 'auto'
    ? true
    : undefined
}
