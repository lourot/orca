import { describe, expect, it } from 'vitest'
import { parseCcusageOpenCodeMonthlyJson } from './ccusage-open-code-monthly-cost'

const NOW = new Date('2026-09-19T12:00:00.000Z')

describe('parseCcusageOpenCodeMonthlyJson', () => {
  it('uses the current month OpenCode total reported by ccusage', () => {
    const result = parseCcusageOpenCodeMonthlyJson(
      JSON.stringify({
        monthly: [
          { month: '2026-08', totalCost: 0.13 },
          {
            month: '2026-09',
            totalCost: 20.83,
            modelBreakdowns: [
              { modelName: 'deepseek-v4-flash', cost: 8.16 },
              { modelName: 'glm-5.3-flash', cost: 12.67 }
            ]
          }
        ]
      }),
      300,
      NOW
    )

    expect(result).toEqual({
      status: 'ok',
      month: '2026-09',
      estimatedCostUsd: 20.83,
      monthlyCapUsd: 300,
      usedPercent: (20.83 / 300) * 100,
      updatedAt: NOW.getTime(),
      error: null
    })
  })

  it('returns unavailable when the current month has no cost', () => {
    const result = parseCcusageOpenCodeMonthlyJson(
      JSON.stringify({ monthly: [{ month: '2026-08', totalCost: 20 }] }),
      300,
      NOW
    )

    expect(result).toMatchObject({
      status: 'unavailable',
      estimatedCostUsd: null,
      error: 'ccusage returned no OpenCode cost for 2026-09'
    })
  })

  it('returns unavailable for malformed output', () => {
    expect(parseCcusageOpenCodeMonthlyJson('not-json', 300, NOW)).toMatchObject({
      status: 'unavailable',
      estimatedCostUsd: null,
      error: 'ccusage returned invalid JSON'
    })
  })
})
