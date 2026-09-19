import { describe, expect, it } from 'vitest'
import type { CodexUsagePersistedState } from './types'
import { estimateCredits } from './codex-credit-pricing'
import { buildCurrentMonthCreditEstimate } from './codex-usage-current-month'

const baseState: CodexUsagePersistedState = {
  schemaVersion: 5,
  worktreeFingerprint: null,
  processedFiles: [],
  sessions: [],
  dailyAggregates: [],
  scanState: {
    enabled: true,
    lastScanStartedAt: null,
    lastScanCompletedAt: null,
    lastScanError: null
  }
}

describe('Codex local credit estimates', () => {
  it('prices cached input separately from uncached input and output', () => {
    expect(estimateCredits('gpt-5.6-sol', 1_000_000, 500_000, 250_000)).toBe(180)
  })

  it('builds a current-month local-account estimate and ignores earlier days', () => {
    const estimate = buildCurrentMonthCreditEstimate(
      {
        ...baseState,
        dailyAggregates: [
          {
            day: '2026-08-31',
            model: 'gpt-5.6-sol',
            projectKey: 'old',
            projectLabel: 'Old',
            repoId: null,
            worktreeId: null,
            eventCount: 1,
            inputTokens: 1_000_000,
            cachedInputTokens: 0,
            outputTokens: 0,
            reasoningOutputTokens: 0,
            totalTokens: 1_000_000,
            hasInferredPricing: false
          },
          {
            day: '2026-09-05',
            model: 'gpt-5.6-sol',
            projectKey: 'current',
            projectLabel: 'Current',
            repoId: null,
            worktreeId: null,
            eventCount: 1,
            inputTokens: 1_000_000,
            cachedInputTokens: 0,
            outputTokens: 0,
            reasoningOutputTokens: 0,
            totalTokens: 1_000_000,
            hasInferredPricing: false
          }
        ]
      },
      new Date(2026, 8, 19, 12)
    )

    expect(estimate).toEqual({
      usedCredits: 100,
      hasUnpricedUsage: false,
      resetsAt: null,
      scope: 'local-accounts'
    })
  })

  it('marks unknown models without presenting zero as a trustworthy estimate', () => {
    expect(
      buildCurrentMonthCreditEstimate(
        {
          ...baseState,
          dailyAggregates: [
            {
              day: '2026-09-05',
              model: 'future-model',
              projectKey: 'current',
              projectLabel: 'Current',
              repoId: null,
              worktreeId: null,
              eventCount: 1,
              inputTokens: 1_000,
              cachedInputTokens: 0,
              outputTokens: 1_000,
              reasoningOutputTokens: 0,
              totalTokens: 2_000,
              hasInferredPricing: true
            }
          ]
        },
        new Date(2026, 8, 19, 12)
      )
    ).toBeNull()
  })
})
