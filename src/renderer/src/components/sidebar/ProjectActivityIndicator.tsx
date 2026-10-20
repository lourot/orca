import React from 'react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { formatAbsoluteDate } from '@/components/activity/activity-thread-presentation'
import { useAppStore } from '@/store'
import type { ProjectActivityLevel } from '@/lib/project-activity-view'

// Green ramp like GitHub's contribution graph; empty days stay neutral grey.
// Why mix toward black in dark mode: the dark success token is a pastel, and fading it
// with opacity reads washed out rather than deep like GitHub's dark greens.
const LEVEL_CLASS: Record<ProjectActivityLevel, string> = {
  0: 'bg-muted-foreground/15',
  1: 'bg-status-success/30 dark:bg-[color-mix(in_srgb,var(--status-success)_22%,black)]',
  2: 'bg-status-success/55 dark:bg-[color-mix(in_srgb,var(--status-success)_34%,black)]',
  3: 'bg-status-success/80 dark:bg-[color-mix(in_srgb,var(--status-success)_46%,black)]',
  4: 'bg-status-success dark:bg-[color-mix(in_srgb,var(--status-success)_58%,black)]'
}

function useProjectActivitySummary(repoId: string): string | null {
  const view = useAppStore((s) => s.projectActivityByRepoId?.[repoId])
  if (!view) {
    return null
  }
  const turns = translate(
    'sidebar.projectActivity.summary',
    '{{count}} agent turns in the last {{days}} days',
    { count: view.totalTurns, days: view.levels.length }
  )
  const lastActive = translate('sidebar.projectActivity.lastActive', 'Last active {{date}}', {
    date: formatAbsoluteDate(view.lastActiveAt)
  })
  return `${turns}. ${lastActive}`
}

/**
 * Project header title, dimmed by how recently an agent worked in the project:
 * full contrast within 24h, muted within the heatmap window, faint before that.
 */
export function ProjectActivityTitle({
  repoId,
  label
}: {
  repoId: string
  label: string
}): React.JSX.Element {
  const anyActivity = useAppStore((s) => Object.keys(s.projectActivityByRepoId ?? {}).length > 0)
  const recency = useAppStore((s) => s.projectActivityByRepoId?.[repoId]?.recency)
  const summary = useProjectActivitySummary(repoId)
  return (
    <div
      className={cn(
        'min-w-0 truncate text-[13px] font-semibold leading-none',
        // Why only with some activity: before the first fetch, on the web client, or with an
        // empty log, every project would otherwise read as inactive.
        anyActivity && recency === undefined && 'text-muted-foreground/60',
        recency === 'week' && 'text-muted-foreground'
      )}
      // Why the native title and not a Tooltip on the heatmap: the hover actions overlay the
      // right end of the row, so the heatmap itself is covered whenever the pointer is on it.
      title={summary ? `${label}\n${summary}` : label}
    >
      {label}
    </div>
  )
}

/** One cell per day of agent turns in the project, oldest first; hidden when there were none. */
export function ProjectActivityHeatmap({ repoId }: { repoId: string }): React.JSX.Element | null {
  const levels = useAppStore((s) => s.projectActivityByRepoId?.[repoId]?.levels)
  const summary = useProjectActivitySummary(repoId)
  if (!levels || !summary) {
    return null
  }
  return (
    <span
      data-project-activity-heatmap=""
      role="img"
      aria-label={summary}
      className="flex shrink-0 items-center gap-0.5"
    >
      {levels.map((level, index) => (
        <span key={index} className={cn('size-1.5 rounded-[1px]', LEVEL_CLASS[level])} />
      ))}
    </span>
  )
}
