import React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'

/** The dot itself. Geometry matches `WorkspaceStatusDot` so both sit in a row
 *  without layout work.
 *
 *  Colour comes from the git decoration tokens because this *is* git status —
 *  see the "Git decoration colors" rule in docs/STYLEGUIDE.md.
 */
function UncommittedChangesDot({
  label,
  testAttribute
}: {
  label: string
  testAttribute: string
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          {...{ [testAttribute]: '' }}
          className="inline-flex size-3 shrink-0 items-center justify-center"
          aria-label={label}
        >
          <span className="block size-2 rounded-full bg-[color:var(--git-decoration-modified)]" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/** Dot on a project header when one of its local worktrees has uncommitted
 *  changes, so a collapsed project still reports it.
 */
export function ProjectUncommittedChangesIndicator({
  hasUncommittedChanges
}: {
  hasUncommittedChanges: boolean
}): React.JSX.Element | null {
  if (!hasUncommittedChanges) {
    return null
  }
  return (
    <UncommittedChangesDot
      label={translate(
        'sidebar.uncommittedChanges.projectIndicator',
        'Uncommitted changes in this project'
      )}
      testAttribute="data-project-uncommitted-changes"
    />
  )
}

/** Dot on a workspace row when that worktree has uncommitted changes, so an
 *  expanded project says *which* worktree the project dot is about.
 */
export function WorktreeUncommittedChangesIndicator({
  worktreeId,
  sweptDirty
}: {
  worktreeId: string
  sweptDirty: boolean
}): React.JSX.Element | null {
  // The active workspace's status is already polled for Source Control, so prefer it
  // over the up-to-30s-stale sweep verdict. null = not the active local workspace,
  // so fall back to the sweep. Boolean|null keeps Object.is from re-rendering the row
  // until the verdict actually flips.
  const liveDirty = useAppStore((s) => {
    if (s.activeWorktreeId !== worktreeId) {
      return null
    }
    // Why the host check: the same worktree id can exist on a remote host too, and
    // gitStatusByWorktree holds whichever copy is active. The sweep is local-only.
    const hostId = s.activeWorkspaceExecutionHostId
    if (hostId && hostId !== LOCAL_EXECUTION_HOST_ID) {
      return null
    }
    // An absent entry is "not fetched yet", not "clean" — a clean tree is stored as []. Reading
    // it as clean would blank a correct sweep verdict for the moment after activation.
    const entries = s.gitStatusByWorktree[worktreeId]
    return entries ? entries.length > 0 : null
  })

  if (!(liveDirty ?? sweptDirty)) {
    return null
  }
  return (
    <UncommittedChangesDot
      label={translate(
        'sidebar.uncommittedChanges.workspaceIndicator',
        'Uncommitted changes in this workspace'
      )}
      testAttribute="data-worktree-uncommitted-changes"
    />
  )
}
