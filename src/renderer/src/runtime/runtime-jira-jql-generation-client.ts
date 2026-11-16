import { translate } from '@/i18n/i18n'
import type {
  JiraJqlGenerationCancellation,
  JiraJqlGenerationRequest,
  JiraJqlGenerationResult
} from '../../../shared/jira/jira-jql-generation'
import { JIRA_JQL_GENERATION_RUNTIME_CAPABILITY } from '../../../shared/jira/jira-detail-capabilities'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'
import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from './runtime-rpc-client'

function canceledResult(): JiraJqlGenerationResult {
  return {
    success: false,
    error: translate('jira.jqlPrompt.canceled', 'Generation canceled.'),
    canceled: true
  }
}

/** Asks the Jira connection's host to rewrite a JQL query with its configured agent. */
export async function generateRuntimeJiraJql(
  target: RuntimeClientTarget,
  args: JiraJqlGenerationRequest,
  signal: AbortSignal
): Promise<JiraJqlGenerationResult> {
  if (target.kind === 'environment') {
    const supported = await runtimeEnvironmentSupportsCapability(
      target.environmentId,
      JIRA_JQL_GENERATION_RUNTIME_CAPABILITY
    )
    if (signal.aborted) {
      return canceledResult()
    }
    if (!supported) {
      return {
        success: false,
        error: translate(
          'jira.jqlPrompt.hostUpdateRequired',
          'Generating JQL requires a newer Orca server. Update the Jira connection’s host and try again.'
        )
      }
    }
    return callRuntimeRpc(target, 'jira.generateJql', args, { timeoutMs: 75_000, signal })
  }
  if (signal.aborted) {
    return canceledResult()
  }
  return window.api.jira.generateJql(args)
}

export async function cancelRuntimeJiraJql(
  target: RuntimeClientTarget,
  args: JiraJqlGenerationCancellation
): Promise<void> {
  await (target.kind === 'environment'
    ? callRuntimeRpc(target, 'jira.cancelGenerateJql', args, { timeoutMs: 5_000 })
    : window.api.jira.cancelGenerateJql(args))
}
