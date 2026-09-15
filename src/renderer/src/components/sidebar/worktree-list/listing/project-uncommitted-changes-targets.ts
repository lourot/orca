import { LOCAL_EXECUTION_HOST_ID } from '../../../../../../shared/execution-host'
import type { ExecutionHostId } from '../../../../../../shared/execution-host'
import { isGitRepoKind } from '../../../../../../shared/repo-kind'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'

export type ProjectUncommittedProbeTarget = {
  worktreeId: string
  worktreePath: string
  repoId: string
}

/** Worktrees the sidebar dirty sweep may probe: git repos on the local host only.
 *
 *  Remote work is deliberately out of scope — one `git status` per worktree per
 *  sweep is a round trip there, not a syscall. The cost of that scoping is that a
 *  missing dot means "clean *or* never probed".
 */
export function selectProjectUncommittedProbeTargets(args: {
  worktrees: readonly Pick<Worktree, 'id' | 'path' | 'repoId'>[]
  repoMap: ReadonlyMap<string, Pick<Repo, 'kind' | 'connectionId'>>
  getExecutionHostId: (worktreeId: string) => ExecutionHostId
}): ProjectUncommittedProbeTarget[] {
  const targets: ProjectUncommittedProbeTarget[] = []
  for (const worktree of args.worktrees) {
    if (!worktree.path) {
      continue
    }
    const repo = args.repoMap.get(worktree.repoId)
    if (!repo || !isGitRepoKind(repo)) {
      continue
    }
    // Why both checks: host resolution falls back to 'local' for a worktree it
    // cannot route, so an SSH repo can surface as local. The repo's own
    // connectionId is the authoritative "this is remote" signal.
    if (repo.connectionId) {
      continue
    }
    if (args.getExecutionHostId(worktree.id) !== LOCAL_EXECUTION_HOST_ID) {
      continue
    }
    targets.push({
      worktreeId: worktree.id,
      worktreePath: worktree.path,
      repoId: worktree.repoId
    })
  }
  return targets
}

/** Worktrees known to have uncommitted changes. */
export function selectDirtyWorktreeIds(
  dirtyByWorktreeId: ReadonlyMap<string, boolean>
): ReadonlySet<string> {
  const dirtyWorktreeIds = new Set<string>()
  for (const [worktreeId, dirty] of dirtyByWorktreeId) {
    if (dirty) {
      dirtyWorktreeIds.add(worktreeId)
    }
  }
  return dirtyWorktreeIds
}

/** Repos with at least one worktree known to have uncommitted changes. */
export function aggregateDirtyRepoIds(
  worktrees: readonly Pick<Worktree, 'id' | 'repoId'>[],
  dirtyByWorktreeId: ReadonlyMap<string, boolean>
): ReadonlySet<string> {
  const dirtyRepoIds = new Set<string>()
  for (const worktree of worktrees) {
    if (dirtyByWorktreeId.get(worktree.id) === true) {
      dirtyRepoIds.add(worktree.repoId)
    }
  }
  return dirtyRepoIds
}
