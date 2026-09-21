import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { OpenCodeMonthlyCost } from '../../../../shared/opencode-usage-types'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

import { OpenCodeMonthlyCostRow, OpenCodeMonthlyCostSegment } from './OpenCodeMonthlyCostSegment'

const usage: OpenCodeMonthlyCost = {
  status: 'ok',
  month: '2026-09',
  estimatedCostUsd: 20.83,
  monthlyCapUsd: 300,
  usedPercent: (20.83 / 300) * 100,
  updatedAt: Date.now(),
  error: null
}

describe('OpenCodeMonthlyCostSegment', () => {
  it('renders the monthly OpenCode estimate and configured cap', () => {
    const markup = renderToStaticMarkup(<OpenCodeMonthlyCostSegment usage={usage} />)

    expect(markup).toContain('OpenCode')
    expect(markup).toContain('~$20.83 / $300.00')
    expect(markup).toContain('Monthly estimate from ccusage')
  })

  it('renders a clickable details row with the current percentage', () => {
    const markup = renderToStaticMarkup(
      <OpenCodeMonthlyCostRow usage={usage} onSelect={() => {}} />
    )

    expect(markup).toContain('OpenCode')
    expect(markup).toContain('6.9%')
  })
})
