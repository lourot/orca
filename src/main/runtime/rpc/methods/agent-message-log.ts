import { getAgentMessageLog } from '../../../agent-message-log/agent-message-log'
import {
  AGENT_MESSAGE_LOG_LIST_MAX,
  AGENT_MESSAGE_LOG_RETENTION_DAYS,
  type AgentMessageLogListResult
} from '../../../../shared/agent-message-log-contract'
import { defineMethod } from '../core'

export const AGENT_MESSAGE_LOG_METHODS = [
  defineMethod({
    name: 'agentMessageLog.list',
    permission: 'workspace',
    params: null,
    handler: async (): Promise<AgentMessageLogListResult> => ({
      entries: getAgentMessageLog()?.list(AGENT_MESSAGE_LOG_LIST_MAX) ?? [],
      retentionDays: AGENT_MESSAGE_LOG_RETENTION_DAYS
    })
  })
]
