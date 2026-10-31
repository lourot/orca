import {
  buildJiraJqlPrompt,
  sanitizeGeneratedJql,
  type JiraJqlGenerationContext,
  type JiraJqlGenerationResult
} from '../../shared/jira/jira-jql-generation'
import type { ResolvedSourceControlAiGenerationParams } from '../../shared/source-control-ai'
import { spawnSourceControlAgent } from './source-control-agent-launch'
import { cancelLocalGeneration } from './source-control-generation-lanes'
import { runGenerationRequest } from './agent-generation-request'
import type {
  CommitMessageGenerationTarget,
  SpawnSourceControlAgent
} from './source-control-text-generation-types'

/** Runs the configured agent headlessly to rewrite a JQL query per the user's instruction. */
export async function generateJiraJqlFromContext(
  context: JiraJqlGenerationContext,
  params: ResolvedSourceControlAiGenerationParams,
  target: CommitMessageGenerationTarget,
  spawnAgent: SpawnSourceControlAgent = spawnSourceControlAgent
): Promise<JiraJqlGenerationResult> {
  const result = await runGenerationRequest({
    params,
    prompt: buildJiraJqlPrompt(context),
    target,
    spawnAgent,
    emptyResultName: 'JQL',
    operation: 'jira-jql'
  })
  if (!result.success) {
    return { success: false, error: result.error, canceled: result.canceled }
  }
  const jql = sanitizeGeneratedJql(result.rawOutput)
  return jql
    ? { success: true, jql, agentLabel: result.agentLabel }
    : { success: false, error: 'Generated JQL was empty or too long after sanitization.' }
}

export function cancelGenerateJiraJqlLocal(cwd: string): void {
  cancelLocalGeneration('jira-jql', cwd)
}
