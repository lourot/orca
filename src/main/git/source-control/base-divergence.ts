import type { GitBaseDivergence } from '../../../shared/git-diff-compare-types'
import { resolveWorktreeAddBaseRef } from '../../../shared/worktree/base-ref'
import type { GitRuntimeOptions } from '../git-runtime-options'
import { resolveWorktreeBaseCommitOid } from '../worktree-base-ref-probe'
import { countCompareDivergence, resolveRefOid } from './compare-ref-oids'

/**
 * Commits HEAD is ahead of and behind `baseRef`, without the merge-base and file
 * listing `getBranchCompare` does. Resolves `baseRef` the same way, so for the same
 * ref the counts match the Source Control panel. Null when the base or HEAD does not resolve.
 */
export async function getBaseDivergence(
  worktreePath: string,
  baseRef: string,
  options: GitRuntimeOptions = {}
): Promise<GitBaseDivergence | null> {
  const qualifiedBaseRef = await resolveWorktreeAddBaseRef(
    baseRef,
    async (ref) => (await resolveWorktreeBaseCommitOid(worktreePath, ref, options)) !== null
  )
  let baseOid: string
  let headOid: string
  try {
    ;[baseOid, headOid] = await Promise.all([
      resolveRefOid(worktreePath, qualifiedBaseRef, options),
      resolveRefOid(worktreePath, 'HEAD', options)
    ])
  } catch {
    return null
  }
  if (baseOid === headOid) {
    return { ahead: 0, behind: 0 }
  }
  return countCompareDivergence(worktreePath, baseOid, headOid, options)
}
