/**
 * The run-guard fields are optional on the record and defaulted on read, so records written
 * before they existed must come back as "overlap guard on, cooldown off". Read naively, an
 * absent boolean is `undefined` — falsy — and the guard is silently off for every existing
 * automation.
 */

import { describe, expect, it } from 'vitest'
import type { Automation } from '../../../shared/automations-types'
import { normalizeStoredAutomation } from './automation-context-migration'

const baseAutomation = {
  id: 'a1',
  name: 'Nightly',
  prompt: 'Run it',
  precheck: null,
  agentId: 'claude',
  projectId: 'r1',
  executionTargetType: 'local',
  executionTargetId: 'local',
  schedulerOwner: 'local_host_service',
  workspaceMode: 'existing',
  workspaceId: 'r1::wt1',
  baseBranch: null,
  reuseSession: false,
  timezone: 'UTC',
  rrule: '0 * * * *',
  dtstart: 0,
  enabled: true,
  nextRunAt: 1000,
  missedRunPolicy: 'run_once_within_grace',
  missedRunGraceMinutes: 720,
  createdAt: 0,
  updatedAt: 0
} satisfies Automation

/** The normalizer's job is to survive whatever the JSON on disk holds, so the cases worth
 *  testing are exactly the ones the type forbids a caller from writing. */
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: deliberately feeding
// the normalizer stored shapes the type rules out, which is what a hand-edited or older store
// file can contain.
const storedAs = (overrides: Record<string, unknown>): Automation =>
  ({ ...baseAutomation, ...overrides }) as Automation

describe('normalizeStoredAutomation run guards', () => {
  it.each([
    ['a record written before the fields existed', {}, { skip: true, cooldown: 0 }],
    ['an explicit opt-out', { skipWhileRunActive: false }, { skip: false, cooldown: 0 }],
    ['an armed cooldown', { minMinutesSinceLastRun: 720 }, { skip: true, cooldown: 720 }],
    // One representation of "off": absent, zero, negative and non-numeric all collapse to 0,
    // so no reader has to decide which of them means the guard is disabled.
    ['a negative cooldown', { minMinutesSinceLastRun: -5 }, { skip: true, cooldown: 0 }],
    ['a non-numeric cooldown', { minMinutesSinceLastRun: 'soon' }, { skip: true, cooldown: 0 }]
  ])('reads %s correctly', (_label, stored, expected) => {
    const normalized = normalizeStoredAutomation(storedAs(stored))
    expect({
      skip: normalized.skipWhileRunActive,
      cooldown: normalized.minMinutesSinceLastRun
    }).toEqual(expected)
  })
})
