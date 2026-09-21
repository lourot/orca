import { codexOpenCodeTokenSessions } from '../usage/agent-token-usage'
import { app } from 'electron'
import { join } from 'node:path'
import type {
  OpenCodeUsageBreakdownKind,
  OpenCodeUsageBreakdownRow,
  OpenCodeUsageDailyPoint,
  OpenCodeUsageRange,
  OpenCodeUsageScope,
  OpenCodeUsageSessionRow,
  OpenCodeUsageSnapshot,
  OpenCodeUsageSummary
} from '../../shared/opencode-usage-types'
import type { Store } from '../persistence'
import type {
  OpenCodeUsageDailyAggregate,
  OpenCodeUsagePersistedState,
  OpenCodeUsageSession
} from './types'
import { openCodeUsageProvider } from './opencode-usage-provider'
import {
  DEFAULT_OPEN_CODE_MONTHLY_CAP_USD,
  getDefaultState,
  normalizePersistedState
} from './persisted-state-normalization'
import {
  filterDailyAggregatesByScopeAndRange,
  filterSessionsByScopeAndRange
} from './scope-range-filter'
import {
  buildOpenCodeUsageBreakdownRows,
  buildOpenCodeUsageDailyPoints,
  buildOpenCodeUsageRecentSessions,
  buildOpenCodeUsageSummary
} from './snapshot-rollups'
import { UsageProviderStoreLifecycle } from '../usage/usage-provider-store-lifecycle'
import { splitUsageCacheFileViaWorker } from '../usage/usage-scan-worker-spawn'
import { fetchOpenCodeMonthlyCost } from './ccusage-open-code-monthly-cost'

let _openCodeUsageFile: string | null = null
const OPEN_CODE_MONTHLY_COST_STALE_MS = 5 * 60_000

export function initOpenCodeUsagePath(): void {
  _openCodeUsageFile = join(app.getPath('userData'), 'orca-opencode-usage.json')
}

function getOpenCodeUsageFile(): string {
  if (!_openCodeUsageFile) {
    _openCodeUsageFile = join(app.getPath('userData'), 'orca-opencode-usage.json')
  }
  return _openCodeUsageFile
}

export class OpenCodeUsageStore extends UsageProviderStoreLifecycle<
  'processedDatabases',
  OpenCodeUsagePersistedState,
  'hasAnyOpenCodeData'
> {
  private openCodeMonthlyCostRefreshPromise: Promise<void> | null = null

  constructor(store: Pick<Store, 'getRepos' | 'getAllWorktreeMeta'>) {
    super(store, {
      tokenUsage: {
        provider: 'opencode',
        selectSessions: (state) => codexOpenCodeTokenSessions(state.sessions)
      },
      logTag: '[opencode-usage]',
      resolveCacheFile: getOpenCodeUsageFile,
      createDefaultState: getDefaultState,
      normalizeState: normalizePersistedState,
      sourceKey: 'processedDatabases',
      dataPresenceKey: 'hasAnyOpenCodeData',
      scan: openCodeUsageProvider.scan,
      splitCacheFile: splitUsageCacheFileViaWorker
    })
  }

  getSnapshot(
    scope: OpenCodeUsageScope,
    range: OpenCodeUsageRange,
    recentSessionLimit = 10
  ): OpenCodeUsageSnapshot {
    return {
      scanState: this.getScanState(),
      summary: this.buildSummary(scope, range),
      daily: this.buildDaily(scope, range),
      modelBreakdown: this.buildBreakdown(scope, range, 'model'),
      projectBreakdown: this.buildBreakdown(scope, range, 'project'),
      recentSessions: this.buildRecentSessions(scope, range, recentSessionLimit)
    }
  }

  async refresh(force = false) {
    const scanState = await super.refresh(force)
    if (this.state.scanState.enabled) {
      await this.refreshOpenCodeMonthlyCost(force)
    }
    return scanState
  }

  async setOpenCodeMonthlyCap(capUsd: number): Promise<void> {
    if (!Number.isFinite(capUsd) || capUsd <= 0) {
      throw new Error('OpenCode monthly cap must be a positive USD amount')
    }
    this.state.openCodeMonthlyCapUsd = capUsd
    if (this.state.openCodeMonthlyCost) {
      const cost = this.state.openCodeMonthlyCost
      this.state.openCodeMonthlyCost = {
        ...cost,
        monthlyCapUsd: capUsd,
        usedPercent:
          cost.estimatedCostUsd === null
            ? null
            : Math.min(100, (cost.estimatedCostUsd / capUsd) * 100)
      }
    }
    await this.writeToDisk()
  }

  async getSummary(
    scope: OpenCodeUsageScope,
    range: OpenCodeUsageRange
  ): Promise<OpenCodeUsageSummary> {
    await this.refresh(false)
    return this.buildSummary(scope, range)
  }

  private buildSummary(scope: OpenCodeUsageScope, range: OpenCodeUsageRange): OpenCodeUsageSummary {
    return {
      ...buildOpenCodeUsageSummary(
        scope,
        range,
        this.getFilteredDaily(scope, range),
        this.getFilteredSessions(scope, range)
      ),
      openCodeMonthlyCost: this.state.openCodeMonthlyCost ?? {
        status: 'unavailable',
        month: new Date().toISOString().slice(0, 7),
        estimatedCostUsd: null,
        monthlyCapUsd: this.state.openCodeMonthlyCapUsd ?? DEFAULT_OPEN_CODE_MONTHLY_CAP_USD,
        usedPercent: null,
        updatedAt: null,
        error: null
      }
    }
  }

  private async refreshOpenCodeMonthlyCost(force: boolean): Promise<void> {
    if (this.openCodeMonthlyCostRefreshPromise) {
      await this.openCodeMonthlyCostRefreshPromise
      return
    }
    const monthlyCapUsd = this.state.openCodeMonthlyCapUsd ?? DEFAULT_OPEN_CODE_MONTHLY_CAP_USD
    const current = this.state.openCodeMonthlyCost
    const month = new Date().toISOString().slice(0, 7)
    if (
      !force &&
      current?.month === month &&
      current.updatedAt !== null &&
      Date.now() - current.updatedAt < OPEN_CODE_MONTHLY_COST_STALE_MS
    ) {
      return
    }
    this.openCodeMonthlyCostRefreshPromise = (async () => {
      this.state.openCodeMonthlyCost = await fetchOpenCodeMonthlyCost(monthlyCapUsd)
      await this.writeToDisk().catch(() => {})
    })()
    try {
      await this.openCodeMonthlyCostRefreshPromise
    } finally {
      this.openCodeMonthlyCostRefreshPromise = null
    }
  }

  async getDaily(
    scope: OpenCodeUsageScope,
    range: OpenCodeUsageRange
  ): Promise<OpenCodeUsageDailyPoint[]> {
    await this.refresh(false)
    return this.buildDaily(scope, range)
  }

  private buildDaily(
    scope: OpenCodeUsageScope,
    range: OpenCodeUsageRange
  ): OpenCodeUsageDailyPoint[] {
    return buildOpenCodeUsageDailyPoints(this.getFilteredDaily(scope, range))
  }

  async getBreakdown(
    scope: OpenCodeUsageScope,
    range: OpenCodeUsageRange,
    kind: OpenCodeUsageBreakdownKind
  ): Promise<OpenCodeUsageBreakdownRow[]> {
    await this.refresh(false)
    return this.buildBreakdown(scope, range, kind)
  }

  private buildBreakdown(
    scope: OpenCodeUsageScope,
    range: OpenCodeUsageRange,
    kind: OpenCodeUsageBreakdownKind
  ): OpenCodeUsageBreakdownRow[] {
    return buildOpenCodeUsageBreakdownRows(
      kind,
      this.getFilteredDaily(scope, range),
      this.getFilteredSessions(scope, range)
    )
  }

  async getRecentSessions(
    scope: OpenCodeUsageScope,
    range: OpenCodeUsageRange,
    limit = 10
  ): Promise<OpenCodeUsageSessionRow[]> {
    await this.refresh(false)
    return this.buildRecentSessions(scope, range, limit)
  }

  private buildRecentSessions(
    scope: OpenCodeUsageScope,
    range: OpenCodeUsageRange,
    limit = 10
  ): OpenCodeUsageSessionRow[] {
    return buildOpenCodeUsageRecentSessions(this.getFilteredSessions(scope, range), limit)
  }

  private getFilteredDaily(
    scope: OpenCodeUsageScope,
    range: OpenCodeUsageRange
  ): OpenCodeUsageDailyAggregate[] {
    return filterDailyAggregatesByScopeAndRange(this.state.dailyAggregates, scope, range)
  }

  private getFilteredSessions(
    scope: OpenCodeUsageScope,
    range: OpenCodeUsageRange
  ): OpenCodeUsageSession[] {
    return filterSessionsByScopeAndRange(this.state.sessions, scope, range)
  }
}
