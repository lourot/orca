import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { WorktreeUncommittedChangesIndicator } from './UncommittedChangesIndicator'

const WORKTREE_ID = 'repo-1::/repo/worktrees/feature'

const mocks = vi.hoisted(() => ({
  activeWorktreeId: null as string | null,
  activeWorkspaceExecutionHostId: null as string | null,
  gitStatusByWorktree: {} as Record<string, { path: string }[] | undefined>
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <span data-tooltip-root="">{children}</span>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <span data-tooltip-content="">{children}</span>
  ),
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector(mocks)
}))

function hasDot(sweptDirty: boolean): boolean {
  const markup = renderToStaticMarkup(
    <WorktreeUncommittedChangesIndicator worktreeId={WORKTREE_ID} sweptDirty={sweptDirty} />
  )
  return markup.includes('data-worktree-uncommitted-changes')
}

/** Makes this worktree the active workspace on the given host. */
function activateOn(hostId: ExecutionHostId | null): void {
  mocks.activeWorktreeId = WORKTREE_ID
  mocks.activeWorkspaceExecutionHostId = hostId
}

describe('WorktreeUncommittedChangesIndicator', () => {
  beforeEach(() => {
    mocks.activeWorktreeId = null
    mocks.activeWorkspaceExecutionHostId = null
    mocks.gitStatusByWorktree = {}
  })

  // The sweep is up to 30s stale, so the row the user is editing must not contradict the
  // Source Control panel sitting next to it — in either direction.
  it('prefers the active workspace live status over the sweep verdict, both ways', () => {
    activateOn('local')

    mocks.gitStatusByWorktree = { [WORKTREE_ID]: [] }
    const liveCleanOverridesSweptDirty = hasDot(true)

    mocks.gitStatusByWorktree = { [WORKTREE_ID]: [{ path: 'a.ts' }] }
    const liveDirtyOverridesSweptClean = hasDot(false)

    expect({ liveCleanOverridesSweptDirty, liveDirtyOverridesSweptClean }).toEqual({
      liveCleanOverridesSweptDirty: false,
      liveDirtyOverridesSweptClean: true
    })
  })

  it('falls back to the sweep verdict for a row that is not the active workspace', () => {
    // Populated for this worktree but it is not active, so it must be ignored.
    mocks.gitStatusByWorktree = { [WORKTREE_ID]: [{ path: 'a.ts' }] }

    expect({ sweptClean: hasDot(false), sweptDirty: hasDot(true) }).toEqual({
      sweptClean: false,
      sweptDirty: true
    })
  })

  // Why: the same worktree id can exist on a remote host, and gitStatusByWorktree holds
  // whichever copy is active. The sweep is local-only, so the remote status is not ours.
  it('ignores the live status when the active workspace is on a non-local host', () => {
    activateOn('ssh:target-1')
    mocks.gitStatusByWorktree = { [WORKTREE_ID]: [{ path: 'a.ts' }] }

    expect(hasDot(false)).toBe(false)
  })

  // A clean tree is stored as [], so undefined means "not fetched yet". Reading it as clean
  // would blank a correct sweep verdict for the moment right after activation.
  it('keeps the sweep verdict when the active workspace has no live status yet', () => {
    activateOn('local')

    expect(hasDot(true)).toBe(true)
  })
})
