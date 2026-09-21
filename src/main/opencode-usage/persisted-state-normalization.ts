import type { OpenCodeUsagePersistedState } from './types'
import { OPENCODE_USAGE_SCHEMA_VERSION } from './opencode-usage-provider'
import {
  normalizeDailyAggregateCost,
  normalizeOpenCodeUsagePersistedDatabases,
  normalizeSessionCost
} from './persisted-database-normalization'

const SCHEMA_VERSION = OPENCODE_USAGE_SCHEMA_VERSION
export const DEFAULT_OPEN_CODE_MONTHLY_CAP_USD = 300

export function getDefaultState(): OpenCodeUsagePersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    worktreeFingerprint: null,
    processedDatabases: [],
    sessions: [],
    dailyAggregates: [],
    openCodeMonthlyCapUsd: DEFAULT_OPEN_CODE_MONTHLY_CAP_USD,
    openCodeMonthlyCost: null,
    scanState: {
      enabled: false,
      lastScanStartedAt: null,
      lastScanCompletedAt: null,
      lastScanError: null
    }
  }
}

export function normalizePersistedState(
  state: OpenCodeUsagePersistedState
): OpenCodeUsagePersistedState {
  const monthlyCapUsd = normalizeMonthlyCapUsd(state.openCodeMonthlyCapUsd)
  if (state.schemaVersion !== SCHEMA_VERSION) {
    const defaults = getDefaultState()
    // The cap is a user setting, not scan data, so a rescan must not reset it.
    return {
      ...defaults,
      openCodeMonthlyCapUsd: monthlyCapUsd,
      scanState: { ...defaults.scanState, enabled: state.scanState?.enabled ?? false }
    }
  }
  const monthlyCost = state.openCodeMonthlyCost
  return {
    ...state,
    openCodeMonthlyCapUsd: monthlyCapUsd,
    openCodeMonthlyCost: monthlyCost
      ? {
          ...monthlyCost,
          monthlyCapUsd,
          usedPercent:
            monthlyCost.estimatedCostUsd === null
              ? null
              : Math.min(100, (monthlyCost.estimatedCostUsd / monthlyCapUsd) * 100),
          error: monthlyCost.error ?? null
        }
      : null,
    processedDatabases: normalizeOpenCodeUsagePersistedDatabases(state.processedDatabases),
    sessions: state.sessions.map(normalizeSessionCost),
    dailyAggregates: state.dailyAggregates.map(normalizeDailyAggregateCost)
  }
}

function normalizeMonthlyCapUsd(configuredCap: number | undefined): number {
  return typeof configuredCap === 'number' && Number.isFinite(configuredCap) && configuredCap > 0
    ? configuredCap
    : DEFAULT_OPEN_CODE_MONTHLY_CAP_USD
}
