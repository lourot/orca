import type { ProviderRateLimits } from '../../shared/rate-limit-types'
import { cancelUnreadResponseBody } from '../lib/unread-response-body'
import {
  classifyCodexRateLimitWindows,
  CODEX_SESSION_WINDOW_MINUTES,
  CODEX_WEEKLY_WINDOW_MINUTES,
  type CodexRateWindowSnapshot
} from './codex-rate-limit-window-classification'
import {
  createCodexBackendRequestSignal,
  getCodexBackendAuthHeaders,
  type CodexBackendRequest
} from './codex-backend-auth'
import type { CodexRateLimitFetchOptions } from './codex-rate-limit-fetch-options'
import { mapCodexRateLimitWindow } from './codex-rate-limit-window-mapper'
import { mapBackendRateLimitResetCredits } from './codex-reset-credit-client'

type BackendRateLimitWindow = {
  used_percent?: number
  limit_window_seconds?: number
  reset_at?: number
}

type BackendCreditUsage = {
  has_credits?: boolean
  unlimited?: boolean
  balance?: number | string | null
}

type BackendSpendControlLimit = {
  used?: number | string | null
  limit?: number | string | null
  remaining?: number | string | null
  used_percent?: number | string | null
  reset_at?: number | null
  reset_after_seconds?: number | null
}

type BackendUsageResponse = {
  plan_type?: string
  rate_limit?: {
    primary_window?: BackendRateLimitWindow | null
    secondary_window?: BackendRateLimitWindow | null
  } | null
  credits?: BackendCreditUsage | null
  spend_control?: {
    individual_limit?: BackendSpendControlLimit | null
  } | null
  individual_limit?: BackendSpendControlLimit | null
  rate_limit_reset_credits?: Parameters<typeof mapBackendRateLimitResetCredits>[0]
}

function parseFiniteNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseNonNegativeNumber(value: number | string | null | undefined): number | null {
  const parsed = parseFiniteNumber(value)
  return parsed !== null && parsed >= 0 ? parsed : null
}

function parseResetAt(limit: BackendSpendControlLimit | null | undefined): number | null {
  if (typeof limit?.reset_at === 'number' && Number.isFinite(limit.reset_at)) {
    return limit.reset_at * 1000
  }
  return typeof limit?.reset_after_seconds === 'number' &&
    Number.isFinite(limit.reset_after_seconds) &&
    limit.reset_after_seconds >= 0
    ? Date.now() + limit.reset_after_seconds * 1000
    : null
}

function mapBackendCreditUsage(payload: BackendUsageResponse) {
  const limit = payload.spend_control?.individual_limit ?? payload.individual_limit
  const usedCredits = parseNonNegativeNumber(limit?.used)
  const limitCredits = parseNonNegativeNumber(limit?.limit)
  const remainingCredits = parseNonNegativeNumber(limit?.remaining)
  const rawUsedPercent = parseFiniteNumber(limit?.used_percent)
  const balance = parseNonNegativeNumber(payload.credits?.balance)
  const hasProviderLimit =
    usedCredits !== null || limitCredits !== null || remainingCredits !== null

  if (hasProviderLimit) {
    const normalizedUsedPercent =
      rawUsedPercent ??
      (usedCredits !== null && limitCredits !== null && limitCredits > 0
        ? (usedCredits / limitCredits) * 100
        : null)
    return {
      usedCredits,
      limitCredits,
      remainingCredits,
      usedPercent:
        normalizedUsedPercent === null ? null : Math.max(0, Math.min(100, normalizedUsedPercent)),
      resetsAt: parseResetAt(limit),
      unlimited: false,
      source: 'provider' as const,
      scope: 'active-account' as const
    }
  }

  if (balance !== null || payload.credits?.unlimited === true) {
    return {
      usedCredits: null,
      limitCredits: null,
      remainingCredits: balance,
      usedPercent: null,
      resetsAt: null,
      unlimited: payload.credits?.unlimited === true,
      source: 'provider' as const,
      scope: 'active-account' as const
    }
  }

  return null
}

function backendWindowToSnapshot(
  raw: BackendRateLimitWindow | null | undefined
): CodexRateWindowSnapshot | null {
  if (!raw) {
    return null
  }
  const limitWindowSeconds = raw.limit_window_seconds
  const windowDurationMins =
    typeof limitWindowSeconds === 'number' &&
    Number.isFinite(limitWindowSeconds) &&
    limitWindowSeconds > 0
      ? Math.ceil(limitWindowSeconds / 60)
      : undefined
  return { usedPercent: raw.used_percent, windowDurationMins, resetsAt: raw.reset_at }
}

function snapshotWindowMinutes(
  snapshot: CodexRateWindowSnapshot | null,
  fallbackWindowMinutes: number
): number {
  const duration = snapshot?.windowDurationMins
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0
    ? duration
    : fallbackWindowMinutes
}

export async function fetchCodexRateLimitsViaBackend(
  request: CodexBackendRequest,
  options?: CodexRateLimitFetchOptions
): Promise<ProviderRateLimits | null> {
  const signal = createCodexBackendRequestSignal(options?.signal)
  const headers = await getCodexBackendAuthHeaders(options, signal)
  if (!headers || signal.aborted) {
    return null
  }
  const response = await request('https://chatgpt.com/backend-api/wham/usage', { headers, signal })
  if (!response.ok) {
    await cancelUnreadResponseBody(response)
    return null
  }
  const payload = (await response.json()) as BackendUsageResponse
  if (typeof payload.plan_type !== 'string') {
    return null
  }
  const classified = classifyCodexRateLimitWindows({
    primary: backendWindowToSnapshot(payload.rate_limit?.primary_window),
    secondary: backendWindowToSnapshot(payload.rate_limit?.secondary_window)
  })
  return {
    provider: 'codex',
    session: mapCodexRateLimitWindow(
      classified.session,
      snapshotWindowMinutes(classified.session, CODEX_SESSION_WINDOW_MINUTES)
    ),
    weekly: mapCodexRateLimitWindow(
      classified.weekly,
      snapshotWindowMinutes(classified.weekly, CODEX_WEEKLY_WINDOW_MINUTES)
    ),
    planType: payload.plan_type,
    creditUsage: mapBackendCreditUsage(payload),
    ...(payload.rate_limit_reset_credits !== undefined
      ? {
          rateLimitResetCredits:
            mapBackendRateLimitResetCredits(payload.rate_limit_reset_credits) ?? null
        }
      : {}),
    updatedAt: Date.now(),
    error: null,
    status: 'ok'
  }
}

export async function supplementCodexSessionWindow(
  limits: ProviderRateLimits,
  request: CodexBackendRequest,
  options?: CodexRateLimitFetchOptions
): Promise<ProviderRateLimits> {
  const needsCreditUsage = !limits.creditUsage
  const needsSession = !limits.session && Boolean(limits.weekly)
  if (options?.signal?.aborted || (!needsCreditUsage && !needsSession)) {
    return limits
  }
  try {
    const backend = await fetchCodexRateLimitsViaBackend(request, options)
    if (!backend) {
      return limits
    }
    const rateLimitResetCredits = backend.rateLimitResetCredits ?? limits.rateLimitResetCredits
    const creditUsage = backend.creditUsage ?? limits.creditUsage
    if (!backend.session) {
      return rateLimitResetCredits === limits.rateLimitResetCredits &&
        creditUsage === limits.creditUsage
        ? limits
        : { ...limits, creditUsage, rateLimitResetCredits }
    }
    return {
      ...limits,
      session: backend.session,
      weekly: backend.weekly ?? limits.weekly,
      planType: backend.planType ?? limits.planType,
      creditUsage,
      ...(rateLimitResetCredits !== undefined ? { rateLimitResetCredits } : {}),
      updatedAt: backend.updatedAt
    }
  } catch {
    return limits
  }
}
