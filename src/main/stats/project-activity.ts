import type { ProjectActivity } from '../../shared/process-stats-types'
import { splitWorktreeId } from '../../shared/worktree/id'
import type { StatsEvent } from './types'

export const PROJECT_ACTIVITY_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

/** The agent starts that can still land in the activity window; bounds what the stats file keeps. */
export function selectRecentAgentStarts(
  events: readonly StatsEvent[],
  now: number,
  days = PROJECT_ACTIVITY_DAYS
): StatsEvent[] {
  // Why one spare day: the window starts at a local midnight, which a fixed span cannot place.
  const cutoff = now - (days + 1) * DAY_MS
  return events
    .filter((event) => event.type === 'agent_start' && event.at >= cutoff)
    .map(({ type, at, repoId, worktreeId }) => ({ type, at, repoId, worktreeId }))
}

/**
 * Per-project agent turns for each of the last `days` local calendar days, oldest first.
 * Projects with no turn in the window are omitted.
 */
export function summarizeProjectActivity(
  events: readonly StatsEvent[],
  now: number,
  days = PROJECT_ACTIVITY_DAYS
): Record<string, ProjectActivity> {
  // Why setDate rather than 24h multiples: local days are 23h or 25h across DST changes.
  const dayStarts: number[] = []
  for (let offset = days - 1; offset >= 0; offset--) {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - offset)
    dayStarts.push(start.getTime())
  }
  const windowStart = dayStarts[0]
  const byRepo: Record<string, ProjectActivity> = {}
  for (const event of events) {
    if (event.type !== 'agent_start' || event.at < windowStart || event.at > now) {
      continue
    }
    // Why worktreeId: the transition recorder never fills repoId, but every worktree id
    // starts with its repo id.
    const repoId = event.repoId ?? (event.worktreeId && splitWorktreeId(event.worktreeId)?.repoId)
    if (!repoId) {
      continue
    }
    let dayIndex = dayStarts.length - 1
    while (dayIndex > 0 && event.at < dayStarts[dayIndex]) {
      dayIndex--
    }
    const activity = (byRepo[repoId] ??= {
      dailyTurns: Array.from({ length: days }, () => 0),
      lastActiveAt: 0
    })
    activity.dailyTurns[dayIndex]++
    activity.lastActiveAt = Math.max(activity.lastActiveAt, event.at)
  }
  return byRepo
}
