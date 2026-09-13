import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'
import { DEFAULT_WORKSPACE_STATUSES } from '../../../../shared/workspace-statuses'

const WORKTREE_CARD_IMPORT_TIMEOUT_MS = 15_000
const WORKTREE_ID = 'repo-1::/repo/worktrees/feature'

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      deleteStateByWorktreeId: {},
      fetchHostedReviewForBranch: vi.fn(),
      fetchIssue: vi.fn(),
      fetchLinearIssue: vi.fn(),
      gitConflictOperationByWorktree: {},
      hostedReviewCache: {},
      issueCache: {},
      linearIssueCache: {},
      openModal: vi.fn(),
      projectGroups: [],
      remoteBranchConflictByWorktreeId: {},
      settings: null,
      sshConnectionStates: new Map(),
      sshTargetLabels: new Map(),
      updateWorktreeMeta: vi.fn(),
      workspacePortScan: null,
      workspaceStatuses: DEFAULT_WORKSPACE_STATUSES.map((status) => ({ ...status })),
      worktreeCardProperties: [],
      // A live tab, so the dot renders filled rather than hollow.
      tabsByWorktree: { [WORKTREE_ID]: [{ id: 'tab-1' }] },
      ptyIdsByTabId: { 'tab-1': ['pty-1'] },
      browserTabsByWorktree: {}
    })
}))

vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: vi.fn()
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('./use-worktree-activity-status', () => ({
  useWorktreeActivityStatus: () => 'idle'
}))

vi.mock('./CacheTimer', () => ({
  default: () => null,
  usePromptCacheCountdownStartedAt: () => null
}))

vi.mock('./WorktreeCardAgents', () => ({
  default: () => null
}))

vi.mock('./WorktreeContextMenu', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
  CLOSE_ALL_CONTEXT_MENUS_EVENT: 'orca:test-close-context-menus',
  WORKTREE_NATIVE_CONTEXT_MENU_ATTR: 'data-worktree-native-context-menu',
  WORKTREE_CONTEXT_MENU_SCOPE_ATTR: 'data-orca-context-menu-scope'
}))

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: WORKTREE_ID,
    repoId: 'repo-1',
    path: '/repo/worktrees/feature',
    displayName: 'Feature tree',
    branch: 'feature/dot',
    head: 'abc123',
    isBare: false,
    isMainWorktree: false,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    ...overrides
  }
}

describe('WorktreeCard workspace status dot', () => {
  it(
    'renders the status dot only where the render site opts in',
    async () => {
      const { default: WorktreeCard } = await import('./WorktreeCard')
      const worktree = makeWorktree({ workspaceStatus: 'in-review' })

      const withDot = renderToStaticMarkup(
        <WorktreeCard
          worktree={worktree}
          repo={undefined}
          isActive={false}
          showWorkspaceStatusDot
        />
      )
      const withoutDot = renderToStaticMarkup(
        <WorktreeCard worktree={worktree} repo={undefined} isActive={false} />
      )

      expect(withDot).toContain('Workspace status: In review')
      expect(withDot).toContain('bg-rose-500')
      expect(withoutDot).not.toContain('Workspace status')
      expect(withoutDot).not.toContain('bg-rose-500')
    },
    WORKTREE_CARD_IMPORT_TIMEOUT_MS
  )
})
