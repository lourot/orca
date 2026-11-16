import type { Worktree } from '../../../../../../shared/worktree/types'
import { isColorTagPersistencePending } from '../metadata/worktree-meta-persist'

/** Keeps a just-picked color on refreshed rows of the refreshing host until its write lands. */
export function preserveConcurrentColorTag<T extends Worktree>(
  incoming: readonly T[],
  current: readonly Worktree[] | undefined,
  matchesRefreshHost: (worktree: Worktree) => boolean
): T[] {
  if (!current) {
    return [...incoming]
  }
  const currentById = new Map(
    current.filter(matchesRefreshHost).map((worktree) => [worktree.id, worktree])
  )
  return incoming.map((worktree) => {
    const latest = currentById.get(worktree.id)
    // Why: a refresh response can predate a color the user just picked; the optimistic value wins
    // until its write lands.
    return latest && isColorTagPersistencePending(worktree.id, latest.hostId)
      ? { ...worktree, colorTag: latest.colorTag ?? null }
      : worktree
  })
}
