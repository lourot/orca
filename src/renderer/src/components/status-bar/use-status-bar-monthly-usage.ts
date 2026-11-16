import { useCallback } from 'react'
import type { ProviderRateLimits, RateLimitState } from '../../../../shared/rate-limit-types'
import type { OpenCodeMonthlyCost } from '../../../../shared/opencode-usage-types'
import { applyCodexLocalCreditEstimate } from './codex-credit-usage'
import { useStatusBarOpenCodeUsage } from './use-status-bar-open-code-usage'
import { useStatusBarCodexCreditEstimate } from './use-status-bar-codex-credit-estimate'

/**
 * This machine's monthly spend signals: the OpenCode ccusage estimate and the local Codex credit
 * estimate. Both are local readings, so they are withheld while a remote owner's usage is shown.
 * `codex` is the shown Codex usage with the local credit estimate filled in where allowed.
 */
export function useStatusBarMonthlyUsage(
  remoteOwned: boolean,
  rateLimits: Pick<RateLimitState, 'codex' | 'codexTarget'>
): {
  openCodeMonthlyCost: OpenCodeMonthlyCost | null
  openCodeScanning: boolean
  codex: ProviderRateLimits | null
  refresh: () => Promise<void>
} {
  const { scanState, usage, fetch } = useStatusBarOpenCodeUsage()
  const {
    estimate,
    enabled: localCreditAnalyticsEnabled,
    refresh: refreshCodexEstimate
  } = useStatusBarCodexCreditEstimate()

  const refresh = useCallback(async (): Promise<void> => {
    await Promise.all([refreshCodexEstimate(), fetch({ forceRefresh: true })])
  }, [refreshCodexEstimate, fetch])

  const openCodeMonthlyCost =
    !remoteOwned &&
    scanState?.enabled === true &&
    usage?.status === 'ok' &&
    usage.estimatedCostUsd !== null
      ? usage
      : null

  return {
    openCodeMonthlyCost,
    openCodeScanning: scanState?.isScanning === true,
    codex: applyCodexLocalCreditEstimate(
      rateLimits.codex,
      estimate,
      !remoteOwned && localCreditAnalyticsEnabled && rateLimits.codexTarget.runtime === 'host'
    ),
    refresh
  }
}
