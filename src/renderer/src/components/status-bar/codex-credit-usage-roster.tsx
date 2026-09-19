import React from 'react'
import type { CodexCreditUsage } from '../../../../shared/rate-limit-types'
import {
  getDisplayedUsagePercentage,
  type UsagePercentageDisplay
} from '../../../../shared/usage-percentage-display'
import { translate } from '@/i18n/i18n'
import { formatCodexCreditAmount, formatCodexCreditScope } from './codex-credit-usage'

export function CodexCreditUsageMetric({
  usage,
  display
}: {
  usage: CodexCreditUsage
  display: UsagePercentageDisplay
}): React.JSX.Element {
  const shownPercent =
    usage.usedPercent === null ? null : getDisplayedUsagePercentage(usage.usedPercent, display)
  const used = formatCodexCreditAmount(usage.usedCredits)
  const limit = formatCodexCreditAmount(usage.limitCredits)
  const remaining = formatCodexCreditAmount(usage.remainingCredits)
  const amount = usage.unlimited
    ? translate('auto.components.status.bar.codexCreditUnlimited', 'Unlimited credits')
    : used !== null && limit !== null
      ? translate(
          'auto.components.status.bar.codexCreditUsedOfLimit',
          '{{value0}} / {{value1}} credits',
          {
            value0: used,
            value1: limit
          }
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
          ? translate('auto.components.status.bar.codexCreditEstimated', '~{{value0}} credits', {
              value0: used
            })
          : translate('auto.components.status.bar.codexCreditUnavailable', 'Credits unavailable')

  return (
    <span data-usage-window="monthly-credits" className="flex shrink-0 items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground">
        {formatCodexCreditScope(usage.scope)}
      </span>
      {shownPercent !== null ? (
        <span className="tabular-nums text-[11px]">
          {shownPercent}% · {amount}
        </span>
      ) : (
        <span className="tabular-nums text-[11px]">{amount}</span>
      )}
    </span>
  )
}
