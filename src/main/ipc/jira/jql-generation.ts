import { ipcMain } from 'electron'
import { CancelGenerateJql, GenerateJql } from '../../../shared/rpc-contract/jira-params'
import type { Store } from '../../persistence/loading-store/store'
import type { CommitMessageAgentEnvironmentResolvers } from '../../text-generation/commit-message-agent-environment'
import {
  cancelJiraJqlRequest,
  generateJiraJqlRequest
} from '../../text-generation/jira-jql-requests'

export function registerJiraJqlGenerationHandlers(
  store: Pick<Store, 'getSettings'>,
  commitMessageAgentEnv?: CommitMessageAgentEnvironmentResolvers
): void {
  ipcMain.handle('jira:generateJql', async (event, args: unknown) => {
    const request = GenerateJql.parse(args)
    const owner = `window:${event.sender.id}`
    const cancel = (): void => cancelJiraJqlRequest(owner, request)
    event.sender.once('destroyed', cancel)
    try {
      return await generateJiraJqlRequest(
        {
          getSettings: () => store.getSettings(),
          getAgentEnvironment: () => commitMessageAgentEnv
        },
        owner,
        request
      )
    } finally {
      event.sender.removeListener('destroyed', cancel)
    }
  })
  ipcMain.handle('jira:cancelGenerateJql', (event, args: unknown) => {
    cancelJiraJqlRequest(`window:${event.sender.id}`, CancelGenerateJql.parse(args))
  })
}
