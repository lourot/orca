import type { ExecutionHostId } from '../../../../../../shared/execution-host'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { isFullGitCommitOid } from '../../../../../../shared/source-control-base-ref-resolution'
import {
  selectProjectUncommittedProbeTargets,
  type ProjectUncommittedProbeTarget
} from './project-uncommitted-changes-targets'

export type WorktreeBaseDivergenceTarget = ProjectUncommittedProbeTarget & {
  /** Worktree pin, then repo pin; the repo default follows them. Empty: repo default only. */
  pinnedBaseRefs: string[]
}

/** Worktrees whose sidebar card shows ahead/behind counts against the base: local git
 *  worktrees except the primary checkout and bare ones. Same host scoping as the dirty sweep. */
export function selectBaseDivergenceTargets(args: {
  worktrees: readonly Pick<
    Worktree,
    'id' | 'path' | 'repoId' | 'isMainWorktree' | 'isBare' | 'baseRef'
  >[]
  repoMap: ReadonlyMap<string, Pick<Repo, 'kind' | 'connectionId' | 'worktreeBaseRef'>>
  getExecutionHostId: (worktreeId: string) => ExecutionHostId | null
}): WorktreeBaseDivergenceTarget[] {
  const byId = new Map(args.worktrees.map((worktree) => [worktree.id, worktree]))
  const eligible = args.worktrees.filter((worktree) => !worktree.isMainWorktree && !worktree.isBare)
  return selectProjectUncommittedProbeTargets({
    worktrees: eligible,
    repoMap: args.repoMap,
    getExecutionHostId: args.getExecutionHostId
  }).map((target) => {
    const worktreeBaseRef = byId.get(target.worktreeId)?.baseRef?.trim()
    const repoBaseRef = args.repoMap.get(target.repoId)?.worktreeBaseRef?.trim()
    const pinnedBaseRefs = [
      // Why: a commit-id pin (PR checkout) never moves, so it can never show "behind";
      // fall back to the repo base instead.
      worktreeBaseRef && !isFullGitCommitOid(worktreeBaseRef) ? worktreeBaseRef : null,
      repoBaseRef || null
    ].filter((ref): ref is string => ref !== null)
    return { ...target, pinnedBaseRefs: [...new Set(pinnedBaseRefs)] }
  })
}

/**
 * Probes the pinned bases in order, then the repo default, and returns the first result
 * with the base it was measured against. A `null` probe reads as "the base does not resolve"
 * (e.g. the pinned branch was deleted), so the next one is tried; a throwing probe or
 * default lookup propagates. Null when no candidate resolves. `git:baseDivergence` also
 * returns null when a ref lookup fails, so a transient git error can show the next base
 * for one sweep.
 */
export async function probeFirstResolvingBase<T extends object>(args: {
  pinnedBaseRefs: readonly string[]
  resolveDefaultBaseRef: () => Promise<string | null>
  probe: (baseRef: string) => Promise<T | null>
}): Promise<(T & { baseRef: string }) | null> {
  for (const baseRef of args.pinnedBaseRefs) {
    const result = await args.probe(baseRef)
    if (result) {
      return { ...result, baseRef }
    }
  }
  const defaultBaseRef = (await args.resolveDefaultBaseRef())?.trim()
  if (!defaultBaseRef || args.pinnedBaseRefs.includes(defaultBaseRef)) {
    return null
  }
  const result = await args.probe(defaultBaseRef)
  return result ? { ...result, baseRef: defaultBaseRef } : null
}
