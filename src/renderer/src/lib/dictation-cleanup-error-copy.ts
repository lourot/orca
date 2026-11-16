import { translate } from '@/i18n/i18n'
import { TEXT_GENERATION_FAILURE_COPY as EN } from '../../../shared/text-generation-failure-copy'

type CopyValues = Record<string, string | number>

// Merged into the text-generation copy table, like the agent-output copy.
export const DICTATION_CLEANUP_ERROR_COPY = {
  commandTemplateEmptyDictationCleanup: (values: CopyValues) =>
    translate(
      'sourceControl.textGeneration.errors.commandTemplateEmptyDictationCleanup',
      EN.commandTemplateEmptyDictationCleanup,
      values
    ),
  dictationCleanupAgentUnsupported: (values: CopyValues) =>
    translate(
      'sourceControl.textGeneration.errors.dictationCleanupAgentUnsupported',
      EN.dictationCleanupAgentUnsupported,
      values
    ),
  dictationCleanupCustomCommandEmpty: (values: CopyValues) =>
    translate(
      'sourceControl.textGeneration.errors.dictationCleanupCustomCommandEmpty',
      EN.dictationCleanupCustomCommandEmpty,
      values
    ),
  agentCannotGenerateDictationCleanup: (values: CopyValues) =>
    translate(
      'sourceControl.textGeneration.errors.agentCannotGenerateDictationCleanup',
      EN.agentCannotGenerateDictationCleanup,
      values
    )
}
