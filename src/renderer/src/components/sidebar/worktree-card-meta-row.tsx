import React from 'react'
import { GitMerge } from 'lucide-react'

import { DetachedHeadBadge } from '@/components/DetachedHeadBadge'
import { RepoBadgeMark } from '@/components/repo/RepoBadgeLabel'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import CacheTimer from './CacheTimer'
import { WorktreeHostContextBadge } from './WorktreeHostContextBadge'
import { conflictOperationLabel } from './WorktreeCardHelpers'
import { TruncatedSidebarLabel } from './truncated-sidebar-label'
import { getDirectoryName } from './worktree-card-model'
import type { WorktreeCardPresentation } from './worktree-card-presentation'
import type { WorktreeCardController } from './use-worktree-card-controller'
import type { WorktreeBaseDivergence } from './worktree-list/listing/use-worktree-base-divergence'
import {
  formatAheadOfTitle,
  formatBehindOfTitle
} from '../right-sidebar/source-control/panel/branch-context-stats'

// Why the modified token: same yellow as the uncommitted-changes dot, so drift reads as git state.
function WorktreeCardBaseDivergence({
  divergence,
  tooltipEnabled
}: {
  divergence: WorktreeBaseDivergence
  tooltipEnabled: boolean
}): React.JSX.Element {
  const { ahead, behind, baseRef } = divergence
  const description = [
    behind > 0 ? formatBehindOfTitle(behind, baseRef) : null,
    ahead > 0 ? formatAheadOfTitle(ahead, baseRef) : null
  ]
    .filter(Boolean)
    .join(', ')
  const counts = (
    <span
      className="shrink-0 font-mono text-[11px] font-bold leading-none text-[color:var(--git-decoration-modified)] tabular-nums"
      data-worktree-card-base-divergence=""
    >
      <span aria-hidden="true">
        {[behind > 0 ? `↓${behind}` : null, ahead > 0 ? `↑${ahead}` : null]
          .filter(Boolean)
          .join(' ')}
      </span>
      <span className="sr-only">{description}</span>
    </span>
  )
  if (!tooltipEnabled) {
    return counts
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>{counts}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {description}
      </TooltipContent>
    </Tooltip>
  )
}

export function WorktreeCardMetaRow({
  card,
  presentation
}: {
  card: WorktreeCardController
  presentation: WorktreeCardPresentation
}): React.JSX.Element {
  const {
    worktree,
    repo,
    identityDisplay,
    isFolder,
    newCardStyle,
    branch,
    detachedHeadDisplay,
    conflictOperation,
    cacheStartedAt,
    cacheTtlMs,
    baseDivergence
  } = card
  const {
    showRepoBadgeInMetaRow,
    showHostContextBadge,
    contextLabel,
    showIdentityInNewCard,
    hasHoverDetails,
    showBranch,
    showDetachedHeadInMetaRow,
    showConflictOperationBadge,
    showBaseDivergence,
    showMetaRowDetails,
    detailsAndPorts
  } = presentation

  return (
    <div className="flex items-center gap-1.5 min-w-0" data-worktree-card-meta-row="">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {showRepoBadgeInMetaRow && repo && (
          // Why: keep a 6rem name floor (+1.625rem chrome) so the branch shrinks first; grow only into width the branch leaves free.
          <div className="flex min-w-0 max-w-max shrink-0 grow basis-[7.625rem] items-center gap-1.5 px-1.5 py-0.5 rounded-[4px] bg-accent border border-border dark:bg-accent/50 dark:border-border/60">
            <RepoBadgeMark color={repo.badgeColor} />
            <span className="min-w-0 truncate text-[10px] font-semibold text-foreground leading-none lowercase">
              {repo.displayName}
            </span>
          </div>
        )}

        {showHostContextBadge && <WorktreeHostContextBadge label={contextLabel ?? ''} />}

        {showIdentityInNewCard ? (
          <TruncatedSidebarLabel
            text={identityDisplay!}
            className="text-[11px] text-muted-foreground leading-none"
            tooltipEnabled={!hasHoverDetails}
          />
        ) : isFolder && !newCardStyle ? (
          <span
            className="min-w-0 truncate font-mono text-[11px] leading-none text-muted-foreground"
            title={worktree.path}
          >
            {getDirectoryName(worktree.path)}
          </span>
        ) : showBranch ? (
          <TruncatedSidebarLabel
            text={branch}
            className="text-[11px] text-muted-foreground leading-none"
            // Why: whole-card details hover already shows full identity; a nested tooltip would compete for it.
            tooltipEnabled={!hasHoverDetails}
          />
        ) : showDetachedHeadInMetaRow && detachedHeadDisplay ? (
          <DetachedHeadBadge
            display={detachedHeadDisplay}
            label="sidebar"
            side="right"
            className="h-[16px]"
          />
        ) : null}

        {showBaseDivergence && baseDivergence && (
          // Why: with hover details the meta row is the details popover's trigger; don't stack a tooltip.
          <WorktreeCardBaseDivergence
            divergence={baseDivergence}
            tooltipEnabled={!hasHoverDetails}
          />
        )}

        {showConflictOperationBadge && (
          <Badge
            variant="outline"
            className="h-[16px] px-1.5 text-[10px] font-medium rounded shrink-0 gap-1 text-amber-600 border-amber-500/30 bg-amber-500/5 dark:text-amber-400 dark:border-amber-400/30 dark:bg-amber-400/5 leading-none"
          >
            <GitMerge className="size-2.5" />
            {conflictOperationLabel(conflictOperation)}
          </Badge>
        )}

        {cacheStartedAt != null && <CacheTimer startedAt={cacheStartedAt} ttlMs={cacheTtlMs} />}
      </div>

      {showMetaRowDetails && (
        <div className="ml-auto flex shrink-0 items-center gap-1 pr-1.5">{detailsAndPorts}</div>
      )}
    </div>
  )
}
