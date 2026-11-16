import { useCallback } from 'react'
import type { DiffComparison } from '../../../../../shared/diff-comparison'
import { diffComparisonForCombinedSection } from '../diff-comment-comparison'
import type { DiffSection } from '../diff-section-types'

type CombinedComparisonModes = Omit<
  Parameters<typeof diffComparisonForCombinedSection>[0],
  'section'
>

/** What each section of a combined diff compares, for the notes taken on it. */
export function useCombinedSectionComparison({
  branchCompare,
  commitCompare,
  isAllMode,
  isBranchMode,
  isCommitMode
}: CombinedComparisonModes): (section: DiffSection) => DiffComparison | undefined {
  return useCallback(
    (section: DiffSection) =>
      diffComparisonForCombinedSection({
        branchCompare,
        commitCompare,
        isAllMode,
        isBranchMode,
        isCommitMode,
        section
      }),
    [branchCompare, commitCompare, isAllMode, isBranchMode, isCommitMode]
  )
}
