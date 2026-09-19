import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'
import type { CodexLocalCreditEstimate } from '../../../../shared/codex-usage-types'
import { translate } from '@/i18n/i18n'

export function applyCodexLocalCreditEstimate(
  provider: ProviderRateLimits | null,
  estimate: CodexLocalCreditEstimate | null,
  allowFallback: boolean
): ProviderRateLimits | null {
  if (!provider || provider.provider !== 'codex' || provider.creditUsage || !allowFallback) {
    return provider
  }
  if (estimate === null) {
    return provider
  }
  return {
    ...provider,
    creditUsage: {
      usedCredits: estimate.usedCredits,
      limitCredits: null,
      remainingCredits: null,
      usedPercent: null,
      resetsAt: estimate.resetsAt,
      unlimited: false,
      source: 'local-estimate',
      scope: estimate.scope
    }
  }
}

export function formatCodexCreditAmount(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null
  }
  return value >= 1000 ? Math.round(value).toLocaleString() : value.toFixed(1)
}

export function formatCodexCreditScope(scope: 'active-account' | 'local-accounts'): string {
  return scope === 'active-account'
    ? translate('auto.components.status.bar.codexCreditScopeActiveFull', 'Active account')
    : translate(
        'auto.components.status.bar.codexCreditScopeLocalEstimateFull',
        'Local accounts · estimated'
      )
}

export function formatCodexCreditShortLabel(usage: {
  source: 'provider' | 'local-estimate'
  usedCredits: number | null
  limitCredits: number | null
}): string {
  if (usage.source === 'local-estimate') {
    return translate('auto.components.status.bar.codexCreditEstimatedShortLabel', 'est.')
  }
  if (usage.usedCredits !== null || usage.limitCredits !== null) {
    return translate('auto.components.status.bar.codexCreditMonthlyShortLabel', 'mo')
  }
  return translate('auto.components.status.bar.codexCreditBalanceShortLabel', 'bal.')
}
