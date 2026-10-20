import type { ProjectActivity } from '../../../shared/process-stats-types'

export type ProjectActivityLevel = 0 | 1 | 2 | 3 | 4

/** `recent` = an agent turn in the last 24h, `week` = within the heatmap window only. */
export type ProjectActivityRecency = 'recent' | 'week'

export type ProjectActivityView = {
  levels: ProjectActivityLevel[]
  totalTurns: number
  lastActiveAt: number
  recency: ProjectActivityRecency
}

const RECENT_MS = 24 * 60 * 60 * 1000

/**
 * Shades each day by quartile of all non-empty days across every project, like GitHub's
 * contribution graph. Why not a ratio to the busiest day: turn counts are heavily skewed
 * (one busy project can do 30x a quiet one), so a ratio leaves almost every cell at level 1.
 */
export function buildProjectActivityViews(
  activityByRepoId: Record<string, ProjectActivity>,
  now: number
): Record<string, ProjectActivityView> {
  const nonEmpty = Object.values(activityByRepoId)
    .flatMap((activity) => activity.dailyTurns)
    .filter((turns) => turns > 0)
    .sort((a, b) => a - b)
  const quartile = (q: number): number => nonEmpty[Math.floor((nonEmpty.length - 1) * q)] ?? 0
  const cutoffs = [quartile(0.25), quartile(0.5), quartile(0.75)]
  const levelOf = (turns: number): ProjectActivityLevel => {
    if (turns <= 0) {
      return 0
    }
    const above = cutoffs.filter((cutoff) => turns > cutoff).length
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: 1 + (0..3 cutoffs exceeded) is 1..4.
    return (1 + above) as ProjectActivityLevel
  }

  const views: Record<string, ProjectActivityView> = {}
  for (const [repoId, activity] of Object.entries(activityByRepoId)) {
    views[repoId] = {
      levels: activity.dailyTurns.map(levelOf),
      totalTurns: activity.dailyTurns.reduce((sum, turns) => sum + turns, 0),
      lastActiveAt: activity.lastActiveAt,
      recency: now - activity.lastActiveAt < RECENT_MS ? 'recent' : 'week'
    }
  }
  return views
}
