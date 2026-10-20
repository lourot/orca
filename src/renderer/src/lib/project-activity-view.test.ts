import { describe, expect, it } from 'vitest'
import { buildProjectActivityViews } from './project-activity-view'

const now = 10 * 24 * 60 * 60 * 1000
const hoursAgo = (hours: number): number => now - hours * 60 * 60 * 1000

describe('buildProjectActivityViews', () => {
  it('shades days by quartile across all projects so one busy project does not flatten the rest', () => {
    const views = buildProjectActivityViews(
      {
        busy: { dailyTurns: [0, 95, 40, 15, 15, 7, 7], lastActiveAt: hoursAgo(1) },
        quiet: { dailyTurns: [1, 2, 3, 3, 0, 0, 0], lastActiveAt: hoursAgo(30) }
      },
      now
    )
    expect(views).toEqual({
      busy: {
        levels: [0, 4, 4, 3, 3, 2, 2],
        totalTurns: 179,
        lastActiveAt: hoursAgo(1),
        recency: 'recent'
      },
      quiet: {
        levels: [1, 1, 1, 1, 0, 0, 0],
        totalTurns: 9,
        lastActiveAt: hoursAgo(30),
        recency: 'week'
      }
    })
  })

  it('puts the 24h recency boundary exactly at 24 hours', () => {
    const views = buildProjectActivityViews(
      {
        justInside: { dailyTurns: [1], lastActiveAt: hoursAgo(24) + 1 },
        atBoundary: { dailyTurns: [1], lastActiveAt: hoursAgo(24) }
      },
      now
    )
    expect([views.justInside.recency, views.atBoundary.recency]).toEqual(['recent', 'week'])
  })
})
