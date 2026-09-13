import React from 'react'

import { StateIndicatorTooltip } from '@/components/StateIndicatorTooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type { Worktree } from '../../../../shared/worktree/types'
import { hasSleepableWorkspaceActivity } from './workspace-lineage-menu-actions'
import { resolveWorkspaceStatusDotVisualSource } from './workspace-status-dot-palette'
import { getWorkspaceStatus, getWorkspaceStatusVisualMeta } from './workspace-status'

/**
 * Board status of a sidebar workspace row, as a small colored dot.
 *
 * Color says how much the workspace wants your attention; fill is whether it
 * has a live tab, so idle rows recede without losing their status.
 */
export function WorkspaceStatusDot({
  worktree
}: {
  worktree: Pick<Worktree, 'id' | 'workspaceStatus'>
}): React.JSX.Element {
  const workspaceStatuses = useAppStore((s) => s.workspaceStatuses)
  // Boolean result, so the default Object.is comparison already prevents re-renders.
  const hasOpenTab = useAppStore((s) => hasSleepableWorkspaceActivity(worktree.id, s))
  const statusId = getWorkspaceStatus(worktree, workspaceStatuses)
  const definition = workspaceStatuses.find((status) => status.id === statusId)
  const { tone, swatch } = getWorkspaceStatusVisualMeta(
    resolveWorkspaceStatusDotVisualSource(statusId, definition, hasOpenTab)
  )
  const label = definition?.label ?? statusId
  const tooltip = hasOpenTab
    ? label
    : translate(
        'auto.components.sidebar.WorkspaceStatusDot.statusIdle',
        '{{status}} · No open tab',
        { status: label }
      )

  return (
    <StateIndicatorTooltip label={tooltip} side="right">
      <span className="inline-flex size-3 shrink-0 items-center justify-center">
        <span
          aria-hidden="true"
          className={cn(
            'size-2 rounded-full',
            // border-current picks up the tone text color, so the hollow state needs no extra token.
            hasOpenTab ? swatch : cn('border border-current bg-transparent', tone)
          )}
        />
        <span className="sr-only">
          {translate(
            'auto.components.sidebar.WorkspaceStatusDot.workspaceStatus',
            'Workspace status: {{status}}',
            { status: tooltip }
          )}
        </span>
      </span>
    </StateIndicatorTooltip>
  )
}
