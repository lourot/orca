// Why: a review note pinned to "line 42" is meaningless to an agent without the
// comparison it was written against. Captured at creation, never recomputed at
// send time - the snapshot IS the answer to "which diff was this note about".

export type DiffComparisonUncommittedSides =
  | 'worktree-vs-head'
  | 'worktree-vs-index'
  | 'index-vs-head'

export type DiffComparison =
  | { kind: 'uncommitted'; compares: DiffComparisonUncommittedSides }
  // `mergeBase`/`headOid` are the oids actually diffed; the refs are the human labels.
  | { kind: 'branch'; baseRef: string; compareRef: string; mergeBase: string; headOid: string }
  | { kind: 'commit'; commitOid: string; parentOid?: string }

const UNCOMMITTED_SIDES: readonly DiffComparisonUncommittedSides[] = [
  'worktree-vs-head',
  'worktree-vs-index',
  'index-vs-head'
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Rejects partially-resolved records outright - a half-known range would name the wrong diff. */
export function parseDiffComparison(value: unknown): DiffComparison | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  if (value.kind === 'uncommitted') {
    const compares = UNCOMMITTED_SIDES.find((side) => side === value.compares)
    return compares ? { kind: 'uncommitted', compares } : undefined
  }
  if (value.kind === 'branch') {
    const mergeBase = nonEmptyString(value.mergeBase)
    const headOid = nonEmptyString(value.headOid)
    if (!mergeBase || !headOid) {
      return undefined
    }
    return {
      kind: 'branch',
      baseRef: typeof value.baseRef === 'string' ? value.baseRef : '',
      compareRef: typeof value.compareRef === 'string' ? value.compareRef : '',
      mergeBase,
      headOid
    }
  }
  if (value.kind === 'commit') {
    const commitOid = nonEmptyString(value.commitOid)
    if (!commitOid) {
      return undefined
    }
    return { kind: 'commit', commitOid, parentOid: nonEmptyString(value.parentOid) }
  }
  return undefined
}

function shortOid(oid: string): string {
  return oid.slice(0, 8)
}

/**
 * Human label for the reviewed comparison, e.g.
 * `origin/main...HEAD (eb046c19..2d96f303)`. Three dots for the symbolic form
 * because that is what merge-base..head means; two for the oid pair because it
 * is runnable as `git diff <a>..<b>`.
 */
export function formatDiffComparisonRange(comparison: DiffComparison): string {
  if (comparison.kind === 'branch') {
    const base = comparison.baseRef || shortOid(comparison.mergeBase)
    const compare = comparison.compareRef || shortOid(comparison.headOid)
    return `${base}...${compare} (${shortOid(comparison.mergeBase)}..${shortOid(comparison.headOid)})`
  }
  if (comparison.kind === 'commit') {
    const oids = comparison.parentOid
      ? `${shortOid(comparison.parentOid)}..${shortOid(comparison.commitOid)}`
      : 'root commit'
    return `commit ${shortOid(comparison.commitOid)} (${oids})`
  }
  if (comparison.compares === 'worktree-vs-head') {
    return 'working tree vs HEAD (uncommitted)'
  }
  return comparison.compares === 'index-vs-head'
    ? 'index vs HEAD (staged)'
    : 'working tree vs index (unstaged)'
}
