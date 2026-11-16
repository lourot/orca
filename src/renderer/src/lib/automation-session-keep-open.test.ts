import { describe, expect, it } from 'vitest'
import { keepsAutomationSessionOpen } from './automation-session-keep-open'

describe('keepsAutomationSessionOpen', () => {
  it.each([
    ['Fresh with no choice saved closes', { reuseSession: false }, false],
    ['Fresh with keep open stays', { reuseSession: false, keepSessionOpen: true }, true],
    [
      'Reuse stays even when keep open is off',
      { reuseSession: true, keepSessionOpen: false },
      true
    ],
    [
      'Skip if open stays even when keep open is off',
      { reuseSession: false, skipWhileSessionOpen: true, keepSessionOpen: false },
      true
    ]
  ])('%s', (_label, automation, expected) => {
    expect(keepsAutomationSessionOpen(automation)).toBe(expected)
  })
})
