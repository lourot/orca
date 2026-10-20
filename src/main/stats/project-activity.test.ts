import { describe, expect, it } from 'vitest'
import { summarizeProjectActivity } from './project-activity'
import type { StatsEvent } from './types'

const now = new Date(2026, 9, 20, 9, 30).getTime()
const at = (day: number, hour: number): number => new Date(2026, 9, day, hour).getTime()
const start = (worktreeId: string, time: number): StatsEvent => ({
  type: 'agent_start',
  at: time,
  worktreeId,
  meta: { sessionKey: 'pane' }
})

describe('summarizeProjectActivity', () => {
  it('buckets agent turns per project into local days, oldest first, ignoring other events and the out-of-window past', () => {
    const events: StatsEvent[] = [
      start('repo-a::/a', at(20, 0)), // today, just after midnight
      start('repo-a::/a', at(19, 23)), // yesterday, just before midnight
      start('repo-a::/a/wt', at(14, 1)), // first day of the 7-day window
      start('repo-a::/a', at(13, 23)), // the day before the window
      { type: 'agent_stop', at: at(20, 1), meta: { sessionKey: 'pane', durationMs: 1 } },
      start('repo-b::/b', at(18, 12)),
      start('repo-c::/c', at(10, 12)),
      { type: 'agent_start', at: at(20, 2), meta: { sessionKey: 'orphan' } }
    ]
    expect(summarizeProjectActivity(events, now)).toEqual({
      'repo-a': { dailyTurns: [1, 0, 0, 0, 0, 1, 1], lastActiveAt: at(20, 0) },
      'repo-b': { dailyTurns: [0, 0, 0, 0, 1, 0, 0], lastActiveAt: at(18, 12) }
    })
  })

  it('prefers an explicit repoId over the one in the worktree id', () => {
    const event: StatsEvent = { ...start('repo-a::/a', at(20, 8)), repoId: 'repo-x' }
    expect(Object.keys(summarizeProjectActivity([event], now))).toEqual(['repo-x'])
  })
})
