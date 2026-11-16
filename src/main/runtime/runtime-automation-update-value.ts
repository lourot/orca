import type { RuntimeAutomationUpdateInput } from './runtime-automation-controller'

export function hasRuntimeAutomationUpdateValue<K extends keyof RuntimeAutomationUpdateInput>(
  updates: RuntimeAutomationUpdateInput,
  key: K
): boolean {
  return Object.hasOwn(updates, key) && updates[key] !== undefined
}

/** Every field a runtime automation update may patch; anything else is dropped. */
export const RUNTIME_AUTOMATION_UPDATE_KEYS = [
  'name',
  'prompt',
  'precheck',
  'agentId',
  'extraAgentArgs',
  'runContext',
  'sourceContext',
  'baseBranch',
  'setupDecision',
  'reuseSession',
  'skipWhileSessionOpen',
  'keepSessionOpen',
  'timezone',
  'rrule',
  'dtstart',
  'enabled',
  'missedRunGraceMinutes',
  'minMinutesSinceLastRun',
  'skipWhileRunActive'
] as const satisfies readonly (keyof RuntimeAutomationUpdateInput)[]
