import React from 'react'
import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'
import type { UsagePercentageDisplay } from '../../../../shared/usage-percentage-display'
import { formatResetCountdown } from '../../../../shared/rate-limit-reset-format'
import { formatUsagePercentageLabel } from './usage-percentage-label'
import { formatCodexCreditAmount, formatCodexCreditScope } from './codex-credit-usage'
import { translate } from '@/i18n/i18n'

export function CodexCreditUsageSection({
  usage,
  textClass,
  mutedClass,
  usagePercentageDisplay,
  now
}: {
  usage: NonNullable<ProviderRateLimits['creditUsage']>
  textClass: string
  mutedClass: string
  usagePercentageDisplay: UsagePercentageDisplay
  now: number
}): React.JSX.Element {
  const used = formatCodexCreditAmount(usage.usedCredits)
  const limit = formatCodexCreditAmount(usage.limitCredits)
  const remaining = formatCodexCreditAmount(usage.remainingCredits)
  const amount = usage.unlimited
    ? translate('auto.components.status.bar.codexCreditUnlimited', 'Unlimited credits')
    : used !== null && limit !== null
      ? translate(
          'auto.components.status.bar.codexCreditUsedOfLimitWithVerb',
          '{{value0}} / {{value1}} credits used',
          { value0: used, value1: limit }
        )
      : remaining !== null
        ? translate(
            'auto.components.status.bar.codexCreditRemaining',
            '{{value0}} credits remaining',
            {
              value0: remaining
            }
          )
        : used !== null
          ? translate(
              'auto.components.status.bar.codexCreditEstimatedWithVerb',
              '~{{value0}} credits estimated',
              { value0: used }
            )
          : translate('auto.components.status.bar.codexCreditUnavailable', 'Credits unavailable')
  const label =
    usage.source === 'local-estimate'
      ? translate('auto.components.status.bar.codexCreditEstimatedLabel', 'estimated credits')
      : usage.usedCredits !== null || usage.limitCredits !== null
        ? translate('auto.components.status.bar.codexCreditMonthlyLabel', 'monthly credits')
        : translate('auto.components.status.bar.codexCreditBalanceLabel', 'credit balance')
  const percent =
    usage.usedPercent === null
      ? null
      : formatUsagePercentageLabel(usage.usedPercent, usagePercentageDisplay)
  const reset = usage.resetsAt ? formatResetCountdown(usage.resetsAt - now) : null

  return (
    <div className="space-y-1">
      <div className={`font-medium ${textClass}`}>
        {formatCodexCreditScope(usage.scope)} {label}
      </div>
      <div className={mutedClass}>
        {percent ? `${percent} · ` : ''}
        {amount}
      </div>
      {reset ? <div className={mutedClass}>{reset}</div> : null}
    </div>
  )
}
