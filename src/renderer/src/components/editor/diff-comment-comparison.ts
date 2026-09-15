import type { BranchCompareSnapshot, CommitCompareSnapshot, OpenFile } from '@/store/slices/editor'
import type { DiffComparison } from '../../../../shared/diff-comparison'
import type { DiffSection } from './diff-section-types'

export const CHANGES_MODE_COMPARISON: DiffComparison = {
  kind: 'uncommitted',
  compares: 'worktree-vs-head'
}

const UNSTAGED_COMPARISON: DiffComparison = { kind: 'uncommitted', compares: 'worktree-vs-index' }
const STAGED_COMPARISON: DiffComparison = { kind: 'uncommitted', compares: 'index-vs-head' }

// Why: a snapshot missing any oid would name a range the note was never reviewed
// against - record nothing instead of half of one.
function branchComparison(
  snapshot: BranchCompareSnapshot | null | undefined
): DiffComparison | undefined {
  if (!snapshot?.baseOid || !snapshot.headOid || !snapshot.mergeBase) {
    return undefined
  }
  return {
    kind: 'branch',
    baseRef: snapshot.baseRef,
    compareRef: snapshot.compareRef,
    mergeBase: snapshot.mergeBase,
    headOid: snapshot.headOid
  }
}

function commitComparison(
  snapshot: CommitCompareSnapshot | null | undefined
): DiffComparison | undefined {
  if (!snapshot?.commitOid) {
    return undefined
  }
  return {
    kind: 'commit',
    commitOid: snapshot.commitOid,
    parentOid: snapshot.parentOid ?? undefined
  }
}

/**
 * The comparison a single-file diff tab is showing. Keyed off `diffSource`, not
 * `mode`: Changes mode and the plain editor share `mode === 'edit'` and only one
 * of them is a diff.
 */
export function diffComparisonForOpenFile(
  file: Pick<OpenFile, 'diffSource' | 'branchCompare' | 'commitCompare'>
): DiffComparison | undefined {
  switch (file.diffSource) {
    case 'unstaged':
      return UNSTAGED_COMPARISON
    case 'staged':
      return STAGED_COMPARISON
    case 'branch':
      return branchComparison(file.branchCompare)
    case 'commit':
      return commitComparison(file.commitCompare)
    // Combined tabs mix comparisons in one tab; they resolve per section instead.
    case 'combined-all':
    case 'combined-branch':
    case 'combined-commit':
    case 'combined-uncommitted':
    case undefined:
      return undefined
  }
}

/**
 * Resolved per section, not per tab: a `combined-all` tab renders uncommitted and
 * branch sections side by side, so one tab-level value would mislabel half the notes.
 * The branch predicate mirrors the one the section loader diffs with.
 */
export function diffComparisonForCombinedSection({
  branchCompare,
  commitCompare,
  isAllMode,
  isBranchMode,
  isCommitMode,
  section
}: {
  branchCompare: BranchCompareSnapshot | null
  commitCompare: CommitCompareSnapshot | null
  isAllMode: boolean
  isBranchMode: boolean
  isCommitMode: boolean
  section: Pick<DiffSection, 'area'>
}): DiffComparison | undefined {
  if (isBranchMode || (isAllMode && section.area === undefined)) {
    return branchComparison(branchCompare)
  }
  if (isCommitMode) {
    return commitComparison(commitCompare)
  }
  return section.area === 'staged' ? STAGED_COMPARISON : UNSTAGED_COMPARISON
}
