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
      tabsByWorktree: {},
      ptyIdsByTabId: {},
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
    branch: 'feature/color',
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

describe('WorktreeCard color tag strip', () => {
  it(
    'paints the strip in the tagged color and names it for screen readers',
    async () => {
      const { default: WorktreeCard } = await import('./WorktreeCard')

      const markup = renderToStaticMarkup(
        <WorktreeCard
          worktree={makeWorktree({ colorTag: '#ef4444' })}
          repo={undefined}
          isActive={false}
        />
      )

      expect(markup).toContain('background-color:#ef4444')
      expect(markup).toContain('Group color #ef4444')
    },
    WORKTREE_CARD_IMPORT_TIMEOUT_MS
  )

  it(
    'renders no strip for an untagged workspace',
    async () => {
      const { default: WorktreeCard } = await import('./WorktreeCard')

      const untagged = renderToStaticMarkup(
        <WorktreeCard worktree={makeWorktree()} repo={undefined} isActive={false} />
      )
      const cleared = renderToStaticMarkup(
        <WorktreeCard
          worktree={makeWorktree({ colorTag: null })}
          repo={undefined}
          isActive={false}
        />
      )

      expect(untagged).not.toContain('Group color')
      // A cleared tag must render byte-identically to one that never had a color.
      expect(cleared).toBe(untagged)
    },
    WORKTREE_CARD_IMPORT_TIMEOUT_MS
  )
})
