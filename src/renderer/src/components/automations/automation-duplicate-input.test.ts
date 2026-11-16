import { describe, expect, it } from 'vitest'
import type { AutomationCreateInput } from '../../../../shared/automations-types'
import { makeAutomation } from './automations-page-fixtures'
import { buildAutomationDuplicateInput } from './automation-duplicate-input'

const configuration = {
  prompt: 'Check every pending item\nPreserve spacing.',
  precheck: { command: 'git status --porcelain', timeoutSeconds: 37 },
  agentId: 'codex',
  extraAgentArgs: '--model gpt-5',
  runContext: {
    kind: 'workspace-run',
    projectId: 'logical-project',
    hostId: 'local',
    projectHostSetupId: 'setup-1',
    repoId: 'repo-1',
    path: '/repo'
  },
  sourceContext: {
    kind: 'task-source',
    provider: 'github',
    projectId: 'logical-project',
    hostId: 'local',
    accountLabel: 'Account'
  },
  projectId: 'repo-1',
  workspaceMode: 'existing',
  workspaceId: 'folder:workspace-1',
  baseBranch: null,
  setupDecision: 'skip',
  reuseSession: false,
  skipWhileSessionOpen: false,
  keepSessionOpen: true,
  timezone: 'Pacific/Auckland',
  rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;BYHOUR=17;BYMINUTE=23',
  dtstart: 1_700_000_000_000,
  enabled: false,
  missedRunGraceMinutes: 19,
  minMinutesSinceLastRun: 43,
  skipWhileRunActive: false
} satisfies Required<Omit<AutomationCreateInput, 'name' | 'creationKey'>>

describe('automation duplicate input', () => {
  it.each(['existing', 'new_per_run'] as const)(
    'preserves every create setting for %s while replacing identity and omitting run state',
    (workspaceMode) => {
      const config = {
        ...configuration,
        workspaceMode,
        workspaceId: workspaceMode === 'existing' ? configuration.workspaceId : null,
        baseBranch: workspaceMode === 'new_per_run' ? 'release' : null,
        reuseSession: workspaceMode === 'existing',
        skipWhileSessionOpen: workspaceMode === 'new_per_run',
        extraAgentArgs: workspaceMode === 'existing' ? '' : configuration.extraAgentArgs,
        enabled: workspaceMode === 'new_per_run'
      }
      const source = makeAutomation({
        ...config,
        creationKey: 'original-request',
        lastRunAt: 123,
        lastDispatchedAt: 456
      })
      const before = structuredClone(source)
      const input = buildAutomationDuplicateInput(source, [source])

      expect(input).toEqual({ ...config, name: 'Nightly (copy)', creationKey: expect.any(String) })
      expect(input.creationKey).not.toBe(source.creationKey)
      expect(source).toEqual(before)
    }
  )

  it('uses the next available copy name from the full host list', () => {
    const source = makeAutomation({ name: 'Nightly <checks>' })
    const input = buildAutomationDuplicateInput(source, [
      source,
      makeAutomation({ name: 'Nightly <checks> (copy)' }),
      makeAutomation({ name: 'Nightly <checks> (copy 2)' })
    ])
    expect(input.name).toBe('Nightly <checks> (copy 3)')
  })
})
