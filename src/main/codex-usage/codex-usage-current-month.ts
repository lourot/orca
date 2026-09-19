import type { CodexLocalCreditEstimate } from '../../shared/codex-usage-types'
import { estimateCredits } from './codex-credit-pricing'
import type { CodexUsagePersistedState } from './types'

function formatLocalDay(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Builds a local-account estimate for the current calendar month. */
export function buildCurrentMonthCreditEstimate(
  state: CodexUsagePersistedState,
  now = new Date()
): CodexLocalCreditEstimate | null {
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const startDay = formatLocalDay(periodStart)
  let usedCredits = 0
  let hasData = false
  let hasUnpricedUsage = false

  for (const entry of state.dailyAggregates) {
    if (entry.day < startDay || entry.totalTokens <= 0) {
      continue
    }
    hasData = true
    const credits = estimateCredits(
      entry.model,
      entry.inputTokens,
      entry.cachedInputTokens,
      entry.outputTokens
    )
    if (credits === null) {
      hasUnpricedUsage = true
      continue
    }
    usedCredits += credits
  }

  if (!hasData || (usedCredits === 0 && hasUnpricedUsage)) {
    return null
  }

  return {
    usedCredits,
    hasUnpricedUsage,
    resetsAt: null,
    scope: 'local-accounts'
  }
}
