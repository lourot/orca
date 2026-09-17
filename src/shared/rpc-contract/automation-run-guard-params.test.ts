/**
 * The wire layer for the two run guards. `missedRunGraceMinutes` next door uses
 * `OptionalPositiveInt`, which transforms every invalid value to `undefined` — and on an
 * update `undefined` means "field omitted", so a junk value reports success and changes
 * nothing. A guard you cannot distinguish from a typo is the failure this feature exists
 * to remove, so these two fields must reject instead.
 */

import { describe, expect, it } from 'vitest'
import { AutomationUpdateFields } from './automation-params'

const parse = (value: unknown): unknown => AutomationUpdateFields.parse(value)

describe('automation run guard update params', () => {
  it('keeps a zero cooldown, so an armed guard can be disarmed', () => {
    expect(parse({ minMinutesSinceLastRun: 0 })).toMatchObject({ minMinutesSinceLastRun: 0 })
  })

  it.each([[-5], [1.5], ['720'], [Number.NaN]])('rejects %p rather than dropping it', (value) => {
    expect(() => parse({ minMinutesSinceLastRun: value })).toThrow()
  })

  it('carries the overlap opt-out, which is the value that differs from the default', () => {
    expect(parse({ skipWhileRunActive: false })).toMatchObject({ skipWhileRunActive: false })
  })
})
