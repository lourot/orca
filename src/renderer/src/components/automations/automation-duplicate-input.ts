import type { Automation, AutomationCreateInput } from '../../../../shared/automations-types'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { translate } from '@/i18n/i18n'

/** Copy saved configuration without carrying identity or previous execution state. */
export function buildAutomationDuplicateInput(
  source: Automation,
  automations: readonly Automation[]
): AutomationCreateInput {
  const names = new Set(automations.map((automation) => automation.name))
  let number = 1
  let name: string
  do {
    name =
      number === 1
        ? translate('automations.duplicate.copyName', '{{name}} (copy)', { name: source.name })
        : translate('automations.duplicate.numberedCopyName', '{{name}} (copy {{number}})', {
            name: source.name,
            number
          })
    number += 1
  } while (names.has(name))

  return {
    creationKey: createBrowserUuid(),
    name,
    prompt: source.prompt,
    precheck: source.precheck,
    agentId: source.agentId,
    extraAgentArgs: source.extraAgentArgs,
    runContext: source.runContext,
    sourceContext: source.sourceContext,
    projectId: source.projectId,
    workspaceMode: source.workspaceMode,
    workspaceId: source.workspaceId,
    baseBranch: source.baseBranch,
    setupDecision: source.setupDecision,
    reuseSession: source.reuseSession,
    timezone: source.timezone,
    rrule: source.rrule,
    dtstart: source.dtstart,
    enabled: source.enabled,
    missedRunGraceMinutes: source.missedRunGraceMinutes,
    minMinutesSinceLastRun: source.minMinutesSinceLastRun,
    skipWhileRunActive: source.skipWhileRunActive
  }
}
