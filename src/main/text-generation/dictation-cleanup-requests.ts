import os from 'node:os'
import { LOCAL_COMMIT_MESSAGE_HOST_KEY } from '../../shared/commit-message-host-key'
import {
  prepareLocalCommitMessageAgentEnv,
  type CommitMessageAgentEnvironmentResolvers
} from './commit-message-agent-environment'
import { resolveTextGenerationParams } from './commit-message-text-generation'
import { generateDictationCleanup } from './dictation-cleanup-generation-request'
import { spawnSourceControlAgent } from './source-control-agent-launch'
import { cancelLocalGeneration } from './source-control-generation-lanes'
import type { GenerateDictationCleanupResult } from './source-control-text-generation-types'

export type DictationCleanupHost = {
  getSettings: () => Parameters<typeof resolveTextGenerationParams>[0]
  getAgentEnvironment: () => CommitMessageAgentEnvironmentResolvers | undefined
}

type ActiveRequest = { owner: string; sessionId: string }
// Why: one lane per cwd, so a newer dictation's cleanup replaces an older one instead of queueing.
let activeRequest: ActiveRequest | undefined
// Why: dictation belongs to no workspace, and an SSH workspace's host must never run it.
const cwd = os.homedir()

const CANCELED: GenerateDictationCleanupResult = {
  success: false,
  error: 'Cleanup canceled.',
  canceled: true
}

/** Cancels the cleanup of one dictation session, if it is still the active one. */
export function cancelDictationCleanupRequest(owner: string, sessionId: string): void {
  if (activeRequest?.owner === owner && activeRequest.sessionId === sessionId) {
    activeRequest = undefined
    cancelLocalGeneration('dictation-cleanup', cwd)
  }
}

/** Cleans up a dictated transcript with the agent configured for dictation cleanup, on this host. */
export async function generateDictationCleanupRequest(
  host: DictationCleanupHost,
  owner: string,
  args: { sessionId: string; transcript: string }
): Promise<GenerateDictationCleanupResult> {
  if (activeRequest) {
    cancelDictationCleanupRequest(activeRequest.owner, activeRequest.sessionId)
  }
  const request = { owner, sessionId: args.sessionId }
  activeRequest = request
  try {
    const resolved = resolveTextGenerationParams(
      host.getSettings(),
      LOCAL_COMMIT_MESSAGE_HOST_KEY,
      'dictationCleanup',
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
    const result = await generateDictationCleanup({
      context: { transcript: args.transcript },
      params: resolved.params,
      target: { kind: 'local', cwd, ...(localEnv.env ? { env: localEnv.env } : {}) },
      spawnAgent: spawnSourceControlAgent
    })
    return activeRequest === request ? result : CANCELED
  } finally {
    if (activeRequest === request) {
      activeRequest = undefined
    }
  }
}
