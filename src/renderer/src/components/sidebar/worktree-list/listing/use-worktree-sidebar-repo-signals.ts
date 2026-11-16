import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { useProjectUncommittedChanges } from './use-project-uncommitted-changes'
import {
  useWorktreeBaseDivergence,
  type WorktreeBaseDivergence
} from './use-worktree-base-divergence'
import { useProjectActivityPolling } from './use-project-activity-polling'

/** Uncommitted-change dots, ahead/behind-base counts and project activity for the sidebar rows. */
export function useWorktreeSidebarRepoSignals(args: {
  worktrees: readonly Worktree[]
  repoMap: ReadonlyMap<string, Repo>
}): {
  dirtyRepoIds: ReadonlySet<string>
  dirtyWorktreeIds: ReadonlySet<string>
  baseDivergenceByWorktreeId: ReadonlyMap<string, WorktreeBaseDivergence>
} {
  // Why the full worktree list and not the rows: rows omit everything under a collapsed
  // project, which is precisely the case the dot exists for.
  const { dirtyRepoIds, dirtyWorktreeIds } = useProjectUncommittedChanges(args)
  const baseDivergenceByWorktreeId = useWorktreeBaseDivergence(args)
  useProjectActivityPolling()
  return { dirtyRepoIds, dirtyWorktreeIds, baseDivergenceByWorktreeId }
}
