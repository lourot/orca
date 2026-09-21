export type OpenCodeUsageScope = 'orca' | 'all'
export type OpenCodeUsageRange = '7d' | '30d' | '90d' | 'all'
export type OpenCodeUsageBreakdownKind = 'model' | 'project'

export type OpenCodeMonthlyCost = {
  status: 'ok' | 'unavailable'
  month: string
  estimatedCostUsd: number | null
  monthlyCapUsd: number
  usedPercent: number | null
  updatedAt: number | null
  error: string | null
}

export type OpenCodeUsageScanState = {
  enabled: boolean
  isScanning: boolean
  lastScanStartedAt: number | null
  lastScanCompletedAt: number | null
  lastScanError: string | null
  hasAnyOpenCodeData: boolean
}

export type OpenCodeUsageSummary = {
  scope: OpenCodeUsageScope
  range: OpenCodeUsageRange
  sessions: number
  events: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
  estimatedCostUsd: number | null
  openCodeMonthlyCost?: OpenCodeMonthlyCost
  topModel: string | null
  topProject: string | null
  hasAnyOpenCodeData: boolean
}

export type OpenCodeUsageDailyPoint = {
  day: string
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}

export type OpenCodeUsageBreakdownRow = {
  key: string
  label: string
  sessions: number
  events: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
  estimatedCostUsd: number | null
}

export type OpenCodeUsageSessionRow = {
  sessionId: string
  lastActiveAt: string
  durationMinutes: number
  projectLabel: string
  model: string | null
  events: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}

export type OpenCodeUsageSnapshot = {
  scanState: OpenCodeUsageScanState
  summary: OpenCodeUsageSummary
  daily: OpenCodeUsageDailyPoint[]
  modelBreakdown: OpenCodeUsageBreakdownRow[]
  projectBreakdown: OpenCodeUsageBreakdownRow[]
  recentSessions: OpenCodeUsageSessionRow[]
}
