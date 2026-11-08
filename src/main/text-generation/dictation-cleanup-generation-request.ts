import {
  buildDictationCleanupPrompt,
  clampDictationTranscript,
  sanitizeDictationCleanupOutput,
  type DictationCleanupContext
} from '../../shared/dictation-cleanup-prompt'
import { planCommitMessageGeneration } from '../../shared/commit-message-plan'
import type { ResolvedSourceControlAiGenerationParams } from '../../shared/source-control-ai'
import { renderSourceControlActionCommandTemplate } from '../../shared/source-control-ai-actions'
import { captureAgentGenerationFailureOutput } from './agent-failure-output'
import {
  commandBackslashMode,
  executeGenerationPlan
} from './source-control-text-generation-requests'
import type {
  CommitMessageGenerationTarget,
  GenerateDictationCleanupResult,
  SpawnSourceControlAgent
} from './source-control-text-generation-types'

/** Runs the configured agent headlessly to fix speech-recognition errors in a dictated text. */
export async function generateDictationCleanup(input: {
  context: DictationCleanupContext
  params: ResolvedSourceControlAiGenerationParams
  target: CommitMessageGenerationTarget
  spawnAgent: SpawnSourceControlAgent
}): Promise<GenerateDictationCleanupResult> {
  const { context, params, target } = input
  const transcript = clampDictationTranscript(context.transcript)
  const prompt =
    params.commandInputTemplate !== undefined
      ? renderSourceControlActionCommandTemplate(params.commandInputTemplate, {
          basePrompt: buildDictationCleanupPrompt({ transcript }),
          transcript
        })
      : buildDictationCleanupPrompt({ transcript }, params.customPrompt ?? '')
  const planned = planCommitMessageGeneration(
    { ...params, backslash: commandBackslashMode(target) },
    prompt
  )
  if (!planned.ok) {
    return { success: false, error: planned.error }
  }

  const result = await executeGenerationPlan({
    ...input,
    plan: planned.plan,
    emptyResultName: 'cleaned transcript',
    operation: 'dictation-cleanup'
  })
  if (!result.success) {
    return result
  }

  const text = sanitizeDictationCleanupOutput(result.rawOutput)
  return text
    ? { success: true, text, agentLabel: result.agentLabel }
    : {
        success: false,
        error: 'Cleaned transcript was empty after sanitization.',
        failureOutput:
          captureAgentGenerationFailureOutput(planned.plan.label, 0, result.rawOutput, '') ??
          undefined
      }
}
