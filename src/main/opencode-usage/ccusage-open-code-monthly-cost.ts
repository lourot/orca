import { runProcess } from '@orca/process-host'
import type { OpenCodeMonthlyCost } from '../../shared/opencode-usage-types'
import { resolveOpenCodeDataDirectory } from '../opencode/opencode-data-directory'

const CCUSAGE_TIMEOUT_MS = 30_000

type JsonObject = Record<string, unknown>

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function currentMonth(now = new Date()): string {
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export function parseCcusageOpenCodeMonthlyJson(
  stdout: string,
  monthlyCapUsd: number,
  now = new Date()
): OpenCodeMonthlyCost {
  const month = currentMonth(now)
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return unavailableOpenCodeMonthlyCost(
      month,
      monthlyCapUsd,
      'ccusage returned invalid JSON',
      now
    )
  }

  if (!isJsonObject(parsed) || !Array.isArray(parsed.monthly)) {
    return unavailableOpenCodeMonthlyCost(
      month,
      monthlyCapUsd,
      'ccusage returned no monthly OpenCode rows',
      now
    )
  }

  const current = parsed.monthly.find(
    (value): value is JsonObject => isJsonObject(value) && value.month === month
  )
  const estimatedCostUsd = current?.totalCost
  if (
    typeof estimatedCostUsd !== 'number' ||
    !Number.isFinite(estimatedCostUsd) ||
    estimatedCostUsd < 0
  ) {
    return unavailableOpenCodeMonthlyCost(
      month,
      monthlyCapUsd,
      `ccusage returned no OpenCode cost for ${month}`,
      now
    )
  }

  return {
    status: 'ok',
    month,
    estimatedCostUsd,
    monthlyCapUsd,
    usedPercent: Math.min(100, (estimatedCostUsd / monthlyCapUsd) * 100),
    updatedAt: now.getTime(),
    error: null
  }
}

export async function fetchOpenCodeMonthlyCost(
  monthlyCapUsd: number
): Promise<OpenCodeMonthlyCost> {
  const now = new Date()
  const month = currentMonth(now)
  try {
    const result = await runProcess({
      program: process.platform === 'win32' ? 'ccusage.cmd' : 'ccusage',
      args: ['opencode', 'monthly', '--json'],
      env: { ...process.env, OPENCODE_DATA_DIR: resolveOpenCodeDataDirectory() },
      timeoutMs: CCUSAGE_TIMEOUT_MS,
      maxOutputBytes: 4 * 1024 * 1024
    })
    if (result.timedOut) {
      return unavailableOpenCodeMonthlyCost(month, monthlyCapUsd, 'ccusage timed out', now)
    }
    if (result.code !== 0) {
      return unavailableOpenCodeMonthlyCost(
        month,
        monthlyCapUsd,
        result.stderr.trim() || 'ccusage failed',
        now
      )
    }
    return parseCcusageOpenCodeMonthlyJson(result.stdout, monthlyCapUsd, now)
  } catch (error) {
    return unavailableOpenCodeMonthlyCost(
      month,
      monthlyCapUsd,
      error instanceof Error ? error.message : 'ccusage is not available',
      now
    )
  }
}

function unavailableOpenCodeMonthlyCost(
  month: string,
  monthlyCapUsd: number,
  error: string,
  now: Date
): OpenCodeMonthlyCost {
  return {
    status: 'unavailable',
    month,
    estimatedCostUsd: null,
    monthlyCapUsd,
    usedPercent: null,
    updatedAt: now.getTime(),
    error
  }
}
