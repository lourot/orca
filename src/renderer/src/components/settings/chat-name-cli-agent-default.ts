import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  resolveSourceControlAiForOperation,
  type normalizeSourceControlAiSettings
} from '../../../../shared/source-control-ai'
import { translate } from '@/i18n/i18n'
import { getAgentLabel } from '@/lib/agent-catalog'
import type { ActionRecipeDraftValue } from './source-control-ai-action-recipe-draft'

export type ChatNameCliAgentDefault = {
  cliAgent: GlobalSettings['defaultTuiAgent'] | 'custom' | null
  label: string
  supportText?: string
  argsPlaceholder?: string
}

/** Chat names use each chat's own agent unless CLI arguments select a configured CLI naming agent. */
export function resolveChatNameCliAgentDefault(
  settings: GlobalSettings,
  config: ReturnType<typeof normalizeSourceControlAiSettings>,
  value: ActionRecipeDraftValue
): ChatNameCliAgentDefault {
  const recipe = config.actions?.conversationName
  const cliRecipe = value.agentArgs?.trim()
    ? resolveSourceControlAiForOperation({
        settings: {
          ...settings,
          sourceControlAi: {
            ...config,
            actions: {
              ...config.actions,
              conversationName: {
                ...recipe,
                ...value,
                ...(recipe?.agentId ? { agentId: null } : {})
              }
            }
          }
        },
        operation: 'conversationName'
      })
    : null
  const cliAgent = cliRecipe?.ok ? cliRecipe.value.params.agentId : null
  const label = cliAgent
    ? translate('settings.chat.names.configuredCliAgent', 'Use configured CLI agent ({{agent}})', {
        agent:
          cliAgent === 'custom'
            ? translate(
                'auto.components.settings.SourceControlAiActionRecipeDefaults.0740d30915',
                'Custom command'
              )
            : getAgentLabel(cliAgent)
      })
    : cliRecipe
      ? translate('settings.chat.names.configuredCliAgentUnknown', 'Use configured CLI agent')
      : translate('settings.chat.names.useChatAgent', 'Use chat agent')
  return {
    cliAgent,
    label,
    supportText:
      cliRecipe && !cliRecipe.ok
        ? cliRecipe.error
        : cliRecipe
          ? translate(
              'settings.chat.names.clearCliArguments',
              'Clear CLI arguments to use each chat’s agent.'
            )
          : undefined,
    argsPlaceholder: cliAgent
      ? undefined
      : translate(
          'settings.chat.names.cliArgumentsPlaceholder',
          'Optional arguments for a configured CLI naming agent'
        )
  }
}
