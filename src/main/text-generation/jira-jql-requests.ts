import os from 'node:os'
import { LOCAL_COMMIT_MESSAGE_HOST_KEY } from '../../shared/commit-message-host-key'
import type {
  JiraJqlGenerationCancellation,
  JiraJqlGenerationRequest,
  JiraJqlGenerationResult
} from '../../shared/jira/jira-jql-generation'
import { getStatus } from '../jira/client'
import {
  prepareLocalCommitMessageAgentEnv,
  type CommitMessageAgentEnvironmentResolvers
} from './commit-message-agent-environment'
import { resolveTextGenerationParams } from './commit-message-text-generation'
import { cancelGenerateJiraJqlLocal, generateJiraJqlFromContext } from './jira-jql-text-generation'

export type JiraJqlGenerationHost = {
  getSettings: () => Parameters<typeof resolveTextGenerationParams>[0]
  getAgentEnvironment: () => CommitMessageAgentEnvironmentResolvers | undefined
}

type ActiveRequest = JiraJqlGenerationCancellation & { owner: string }
// IPC and RPC share the same process lane, including while preparing account credentials.
let activeRequest: ActiveRequest | undefined
// Why: JQL belongs to no workspace, so the agent runs outside any repository.
const cwd = os.homedir()

const CANCELED: JiraJqlGenerationResult = {
  success: false,
  error: 'Generation canceled.',
  canceled: true
}

/** Cancels one JQL generation, if it is still the active request of that owner. */
export function cancelJiraJqlRequest(owner: string, args: JiraJqlGenerationCancellation): void {
  if (
    activeRequest?.owner === owner &&
    activeRequest.siteId === args.siteId &&
    activeRequest.requestId === args.requestId
  ) {
    activeRequest = undefined
    cancelGenerateJiraJqlLocal(cwd)
  }
}

/** Rewrites a JQL query with the agent configured for branch names, on this host. */
export async function generateJiraJqlRequest(
  host: JiraJqlGenerationHost,
  owner: string,
  args: JiraJqlGenerationRequest,
  signal?: AbortSignal
): Promise<JiraJqlGenerationResult> {
  if (!args.instruction.trim()) {
    return { success: false, error: 'An instruction is required.' }
  }
  if (!getStatus().sites?.some((site) => site.id === args.siteId)) {
    return { success: false, error: 'Reconnect the selected Jira account on this host.' }
  }
  if (signal?.aborted) {
    return CANCELED
  }
  if (activeRequest) {
    if (activeRequest.owner !== owner || activeRequest.siteId !== args.siteId) {
      return { success: false, error: 'A Jira query is already being generated elsewhere.' }
    }
    cancelJiraJqlRequest(owner, activeRequest)
  }
  const request = { owner, siteId: args.siteId, requestId: args.requestId }
  activeRequest = request
  const cancel = (): void => cancelJiraJqlRequest(owner, request)
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    const resolved = resolveTextGenerationParams(
      host.getSettings(),
      LOCAL_COMMIT_MESSAGE_HOST_KEY,
      'branchName',
      null
    )
    if (!resolved.ok) {
      return { success: false, error: resolved.error }
    }
    const localEnv = await prepareLocalCommitMessageAgentEnv(
      resolved.params.agentId,
      host.getAgentEnvironment()
    )
    if (activeRequest !== request) {
      return CANCELED
    }
    if (!localEnv.ok) {
      return { success: false, error: localEnv.error }
    }
    if (!getStatus().sites?.some((site) => site.id === args.siteId)) {
      return { success: false, error: 'Reconnect the selected Jira account on this host.' }
    }
    const result = await generateJiraJqlFromContext(args, resolved.params, {
      kind: 'local',
      cwd,
      ...(localEnv.env ? { env: localEnv.env } : {})
    })
    return activeRequest === request ? result : CANCELED
  } finally {
    signal?.removeEventListener('abort', cancel)
    if (activeRequest === request) {
      activeRequest = undefined
    }
  }
}
