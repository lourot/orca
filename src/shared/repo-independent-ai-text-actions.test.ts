import { describe, expect, it } from 'vitest'
import { getDefaultSettings } from './constants'
import { SOURCE_CONTROL_TEXT_ACTION_IDS } from './source-control-ai-actions'
import { resolveSourceControlAiForOperation } from './source-control-ai'

describe('repo-independent AI text actions', () => {
  it.each(['conversationName', 'dictationCleanup'] as const)(
    '%s ignores repository overrides but applies the global model and recipe',
    (operation) => {
      const settings = getDefaultSettings('/tmp')
      settings.sourceControlAi = {
        ...settings.sourceControlAi!,
        enabled: false,
        agentId: 'codex',
        selectedModelByAgent: { codex: 'gpt-5.5' },
        actions: {
          ...settings.sourceControlAi?.actions,
          [operation]: { commandInputTemplate: '{basePrompt}', agentArgs: '--global' }
        }
      }
      const result = resolveSourceControlAiForOperation({
        settings,
        operation,
        repo: {
          sourceControlAi: {
            customAgentCommand: 'repo-agent',
            enabled: false,
            actionOverrides: { commitMessage: { agentArgs: '--repo' } },
            modelOverridesByOperation: {
              commitMessage: { selectedModelByAgent: { codex: 'gpt-5.4' } }
            }
          }
        }
      })
      expect(result).toMatchObject({
        ok: true,
        value: { params: { agentId: 'codex', model: 'gpt-5.5', agentArgs: '--global' } }
      })
      expect(result.ok && result.value.params.customAgentCommand).toBeUndefined()
      expect(SOURCE_CONTROL_TEXT_ACTION_IDS).not.toContain(operation)
    }
  )

  it.each([
    ['conversationName', 'Settings -> Chat -> Chat names'],
    ['dictationCleanup', 'Settings -> Voice -> Transcript cleanup']
  ] as const)('%s agent errors point to %s', (operation, settingsPath) => {
    const settings = getDefaultSettings('/tmp')
    settings.sourceControlAi = {
      ...settings.sourceControlAi!,
      actions: { ...settings.sourceControlAi?.actions, [operation]: { agentId: 'custom' } },
      customAgentCommand: ''
    }
    const result = resolveSourceControlAiForOperation({ settings, operation })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain(settingsPath)
  })
})
