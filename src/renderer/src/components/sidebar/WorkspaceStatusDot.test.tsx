import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceStatusDefinition } from '../../../../shared/worktree/types'
import { DEFAULT_WORKSPACE_STATUSES } from '../../../../shared/workspace-statuses'
import { WorkspaceStatusDot } from './WorkspaceStatusDot'

const WORKTREE_ID = 'repo-1::/repo/worktrees/feature'

// Swatches of the ramp, so a colour-id typo fails rather than silently repainting.
const ROSE = 'bg-rose-500'
const AMBER = 'bg-[#d4a300]'
const EMERALD = 'bg-emerald-500'
const GREY = 'text-muted-foreground'

const mocks = vi.hoisted(() => ({
  workspaceStatuses: [] as WorkspaceStatusDefinition[],
  tabsByWorktree: {} as Record<string, { id: string }[]>,
  ptyIdsByTabId: {} as Record<string, string[]>,
  browserTabsByWorktree: {} as Record<string, { id: string }[]>
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

/** Gives the worktree one terminal tab with a live pty. */
function withLiveTab(): void {
  mocks.tabsByWorktree = { [WORKTREE_ID]: [{ id: 'tab-1' }] }
  mocks.ptyIdsByTabId = { 'tab-1': ['pty-1'] }
}

function renderDot(workspaceStatus?: string): string {
  return renderToStaticMarkup(
    <WorkspaceStatusDot worktree={{ id: WORKTREE_ID, workspaceStatus }} />
  )
}

describe('WorkspaceStatusDot', () => {
  beforeEach(() => {
    mocks.workspaceStatuses = DEFAULT_WORKSPACE_STATUSES.map((status) => ({ ...status }))
    mocks.tabsByWorktree = {}
    mocks.ptyIdsByTabId = {}
    mocks.browserTabsByWorktree = {}
  })

  it('paints the whole ramp: todo and review demand attention, done is settled', () => {
    withLiveTab()

    expect({
      todo: renderDot('todo').includes(ROSE),
      inProgress: renderDot('in-progress').includes(AMBER),
      inReview: renderDot('in-review').includes(ROSE),
      done: renderDot('completed').includes(EMERALD)
    }).toEqual({ todo: true, inProgress: true, inReview: true, done: true })
  })

  it('drops in-progress out of the ramp to grey when nothing is running', () => {
    const markup = renderDot('in-progress')

    expect(markup).toContain(GREY)
    expect(markup).not.toContain(AMBER)
  })

  it('keeps the other statuses on their ramp colour when nothing is running', () => {
    // Only in-progress claims activity, so only it is contradicted by an idle workspace.
    expect(renderDot('in-review')).toContain('text-rose-600')
    expect(renderDot('completed')).toContain('text-emerald-700')
  })

  it('fills the dot only while the workspace has a live tab', () => {
    expect(renderDot('in-review')).toContain('border-current')

    withLiveTab()
    const markup = renderDot('in-review')
    expect(markup).toContain(ROSE)
    expect(markup).not.toContain('border-current')
  })

  it('counts a browser tab as an open tab even with no terminal', () => {
    mocks.browserTabsByWorktree = { [WORKTREE_ID]: [{ id: 'browser-1' }] }

    expect(renderDot('in-review')).toContain(ROSE)
  })

  it('treats a terminal tab whose pty is gone as no open tab', () => {
    mocks.tabsByWorktree = { [WORKTREE_ID]: [{ id: 'tab-1' }] }
    mocks.ptyIdsByTabId = {}

    expect(renderDot('in-review')).toContain('border-current')
  })

  it('ignores tabs that belong to a different workspace', () => {
    mocks.tabsByWorktree = { 'other-worktree': [{ id: 'tab-1' }] }
    mocks.ptyIdsByTabId = { 'tab-1': ['pty-1'] }

    expect(renderDot('in-review')).toContain('border-current')
  })

  it('falls back to the default status when the stored id is no longer in the catalog', () => {
    withLiveTab()

    // Resolves to in-progress, so it takes that ramp colour rather than in-review's.
    expect(renderDot('deleted-status')).toContain(AMBER)
  })

  it('lets a colour the user picked themselves override the ramp', () => {
    withLiveTab()
    mocks.workspaceStatuses = DEFAULT_WORKSPACE_STATUSES.map((status) =>
      status.id === 'in-review' ? { ...status, color: 'violet' } : { ...status }
    )

    const markup = renderDot('in-review')

    expect(markup).toContain('bg-violet-500')
    expect(markup).not.toContain(ROSE)
  })

  it('uses the ramp for a custom status only when it has no colour of its own', () => {
    withLiveTab()
    mocks.workspaceStatuses = [
      ...DEFAULT_WORKSPACE_STATUSES.map((status) => ({ ...status })),
      { id: 'blocked', label: 'Blocked', color: 'sky', icon: 'ban' },
      { id: 'triage', label: 'Triage' }
    ]

    // A custom status is not in the ramp, so its own colour wins either way.
    expect(renderDot('blocked')).toContain('bg-sky-500')
    // No colour at all falls through to the catalog default, not to a ramp colour.
    expect(renderDot('triage')).toContain('bg-muted-foreground')
  })

  it('announces the resolved status label, and the idle state when there is no open tab', () => {
    mocks.workspaceStatuses = DEFAULT_WORKSPACE_STATUSES.map((status) =>
      status.id === 'in-review' ? { ...status, label: 'Needs eyes' } : { ...status }
    )

    expect(renderDot('in-review')).toContain('Workspace status: Needs eyes · No open tab')

    withLiveTab()
    expect(renderDot('in-review')).toContain('Workspace status: Needs eyes')
    expect(renderDot('in-review')).not.toContain('No open tab')
  })
})
