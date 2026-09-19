import { describe, expect, it } from 'vitest'
import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'
import { applyCodexLocalCreditEstimate } from './codex-credit-usage'

const provider: ProviderRateLimits = {
  provider: 'codex',
  session: null,
  weekly: null,
  updatedAt: 1,
  error: null,
  status: 'ok'
}

describe('Codex credit usage presentation', () => {
  it('adds a local estimate only when fallback is allowed', () => {
    const estimate = {
      usedCredits: 12.5,
      hasUnpricedUsage: false,
      resetsAt: null,
      scope: 'local-accounts' as const
    }

    expect(applyCodexLocalCreditEstimate(provider, estimate, true)?.creditUsage).toMatchObject({
      usedCredits: 12.5,
      source: 'local-estimate',
      scope: 'local-accounts'
    })
    expect(applyCodexLocalCreditEstimate(provider, estimate, false)).toBe(provider)
  })

  it('never replaces provider-reported monthly data with a local estimate', () => {
    const providerWithCredits: ProviderRateLimits = {
      ...provider,
      creditUsage: {
        usedCredits: 40,
        limitCredits: 10_000,
        remainingCredits: 9_960,
        usedPercent: 0.4,
        resetsAt: null,
        unlimited: false,
        source: 'provider',
        scope: 'active-account'
      }
    }

    expect(
      applyCodexLocalCreditEstimate(
        providerWithCredits,
        { usedCredits: 12.5, hasUnpricedUsage: false, resetsAt: null, scope: 'local-accounts' },
        true
      )
    ).toBe(providerWithCredits)
  })
})
