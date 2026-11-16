import {
  buildDictationCleanupPrompt,
  clampDictationTranscript,
  sanitizeDictationCleanupOutput,
  type DictationCleanupContext
} from '../../shared/dictation-cleanup-prompt'
import type { ResolvedSourceControlAiGenerationParams } from '../../shared/source-control-ai'
import { renderSourceControlActionCommandTemplate } from '../../shared/source-control-ai-actions'
import { captureAgentGenerationFailureOutput } from './agent-failure-output'
import { runGenerationRequest } from './agent-generation-request'
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
  const { context, params } = input
  const transcript = clampDictationTranscript(context.transcript)
  const prompt =
    params.commandInputTemplate !== undefined
      ? renderSourceControlActionCommandTemplate(params.commandInputTemplate, {
          basePrompt: buildDictationCleanupPrompt({ transcript }),
          transcript
        })
      : buildDictationCleanupPrompt({ transcript }, params.customPrompt ?? '')
  const result = await runGenerationRequest({
    ...input,
    prompt,
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
          captureAgentGenerationFailureOutput(
            result.agentLabel ?? params.agentId,
            0,
            result.rawOutput,
            ''
          ) ?? undefined
      }
}
