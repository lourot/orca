import { join } from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import { AgentMessageLogDatabase } from './agent-message-log-database'

let database: AgentMessageLogDatabase | null | undefined

/** The host's message log, opened on first use; null when SQLite is unavailable. */
export function getAgentMessageLog(): AgentMessageLogDatabase | null {
  if (database !== undefined) {
    return database
  }
  try {
    database = new AgentMessageLogDatabase(
      join(getAppEnvironment().getPath('userData'), 'agent-message-log.sqlite')
    )
  } catch (error) {
    console.warn('[agent-message-log] unavailable', error)
    database = null
  }
  return database
}
