import type { z } from 'zod'
import type { TerminalSend } from '../../../../../shared/rpc-contract/terminal-unary-params'
import type { RuntimeTerminalSummary } from '../../../../../shared/runtime-terminal-contracts'
import type { AgentMessageLogOutcome } from '../../../../../shared/agent-message-log-contract'
import { isUntypedTerminalInput } from '../../../../../shared/terminal-untyped-input'
import type { AgentMessageLogInsert } from '../../../../agent-message-log/agent-message-log-database'
import { getAgentMessageLog } from '../../../../agent-message-log/agent-message-log'
import type { RpcContext } from '../../core'
import { terminalInputSourceForClient } from './terminal-input-delivery'

type TerminalSendLogContext = Pick<RpcContext, 'caller' | 'replayedMutationReceipt'> & {
  runtime: Pick<RpcContext['runtime'], 'listTerminals'>
}

type MessageLogSink = { insert(entry: AgentMessageLogInsert): void } | null

/**
 * Starts logging a CLI `terminal.send` that carries text, whatever its wording or flags, so the log
 * keeps working when skills change how they phrase messages. Returns null for sends not logged;
 * otherwise call the result once with the handler's result (or `undefined` when it threw).
 */
export function beginTerminalSendMessageLog(
  params: z.output<typeof TerminalSend>,
  ctx: TerminalSendLogContext,
  getLog: () => MessageLogSink = getAgentMessageLog
): ((result: unknown) => void) | null {
  if (
    ctx.replayedMutationReceipt !== undefined ||
    terminalInputSourceForClient(params.client, ctx.caller) !== 'programmatic' ||
    !params.text ||
    isUntypedTerminalInput(params.text)
  ) {
    return null
  }
  const sentAt = Date.now()
  const text = params.text
  const targetHandle = params.terminal
  // Resolved in parallel with the send so logging adds no latency; the target may close meanwhile.
  const target = ctx.runtime
    .listTerminals(undefined, 1, { handles: [targetHandle], includeVisualLayouts: false })
    .then((listed) => listed.terminals[0] ?? null)
    .catch(() => null)
  return (result) => {
    void target.then((summary) => {
      try {
        getLog()?.insert({
          sentAt,
          text,
          targetHandle,
          ...outcomeOf(result),
          ...targetFields(summary)
        })
      } catch (error) {
        console.warn('[agent-message-log] failed to record a terminal send', error)
      }
    })
  }
}

function outcomeOf(result: unknown): {
  outcome: AgentMessageLogOutcome
  refusedReason: string | null
} {
  const send = isRecord(result) && isRecord(result.send) ? result.send : null
  if (!send) {
    return { outcome: 'error', refusedReason: null }
  }
  if (send.accepted === true) {
    return { outcome: 'accepted', refusedReason: null }
  }
  return {
    outcome: 'refused',
    refusedReason: typeof send.refusedReason === 'string' ? send.refusedReason : null
  }
}

function targetFields(summary: RuntimeTerminalSummary | null) {
  return {
    worktreeId: summary?.worktreeId ?? null,
    worktreePath: summary?.worktreePath ?? null,
    branch: summary?.branch ?? null,
    terminalTitle: summary?.paneTitle ?? summary?.title ?? null,
    agent: summary?.agentIdentity ?? null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
