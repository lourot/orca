import { describe, it, expect } from 'vitest'
import type { BranchCompareSnapshot, CommitCompareSnapshot } from '@/store/slices/editor'
import type { DiffComparison } from '../../../../shared/diff-comparison'
import {
  diffComparisonForCombinedSection,
  diffComparisonForOpenFile
} from './diff-comment-comparison'
import type { DiffSection } from './diff-section-types'

const BRANCH: BranchCompareSnapshot = {
  baseRef: 'origin/main',
  baseOid: 'base0000',
  compareRef: 'HEAD',
  headOid: 'head0000',
  mergeBase: 'merge000',
  compareVersion: '1'
}

const COMMIT: CommitCompareSnapshot = {
  commitOid: 'commit00',
  parentOid: 'parent00',
  compareRef: 'HEAD',
  baseRef: 'HEAD~1',
  compareVersion: '1'
}

const BRANCH_COMPARISON: DiffComparison = {
  kind: 'branch',
  baseRef: 'origin/main',
  compareRef: 'HEAD',
  mergeBase: 'merge000',
  headOid: 'head0000'
}

function section(area?: DiffSection['area']): Pick<DiffSection, 'area'> {
  return { area }
}

describe('diffComparisonForOpenFile', () => {
  it('maps every single-file diff source to the comparison it renders', () => {
    const cases = [
      ['unstaged', { kind: 'uncommitted', compares: 'worktree-vs-index' }],
      ['staged', { kind: 'uncommitted', compares: 'index-vs-head' }],
      ['branch', BRANCH_COMPARISON],
      ['commit', { kind: 'commit', commitOid: 'commit00', parentOid: 'parent00' }],
      // Combined tabs resolve per section, not per tab.
      ['combined-all', undefined],
      ['combined-branch', undefined],
      [undefined, undefined]
    ] as const
    expect(
      cases.map(([diffSource]) =>
        diffComparisonForOpenFile({ diffSource, branchCompare: BRANCH, commitCompare: COMMIT })
      )
    ).toEqual(cases.map(([, expected]) => expected))
  })

  it('records nothing when the branch snapshot is only half resolved', () => {
    expect(
      diffComparisonForOpenFile({
        diffSource: 'branch',
        branchCompare: { ...BRANCH, mergeBase: null }
      })
    ).toBeUndefined()
    expect(
      diffComparisonForOpenFile({ diffSource: 'branch', branchCompare: undefined })
    ).toBeUndefined()
  })

  it('omits parentOid for a root commit rather than inventing one', () => {
    expect(
      diffComparisonForOpenFile({
        diffSource: 'commit',
        commitCompare: { ...COMMIT, parentOid: null }
      })
    ).toEqual({ kind: 'commit', commitOid: 'commit00', parentOid: undefined })
  })
})

describe('diffComparisonForCombinedSection', () => {
  it('splits a combined-all tab by section: no area means the branch half', () => {
    const args = {
      branchCompare: BRANCH,
      commitCompare: null,
      isAllMode: true,
      isBranchMode: false,
      isCommitMode: false
    }
    expect(diffComparisonForCombinedSection({ ...args, section: section() })).toEqual(
      BRANCH_COMPARISON
    )
    expect(diffComparisonForCombinedSection({ ...args, section: section('staged') })).toEqual({
      kind: 'uncommitted',
      compares: 'index-vs-head'
    })
    expect(diffComparisonForCombinedSection({ ...args, section: section('unstaged') })).toEqual({
      kind: 'uncommitted',
      compares: 'worktree-vs-index'
    })
    expect(diffComparisonForCombinedSection({ ...args, section: section('untracked') })).toEqual({
      kind: 'uncommitted',
      compares: 'worktree-vs-index'
    })
  })

  it('records nothing for a branch section whose snapshot never resolved', () => {
    expect(
      diffComparisonForCombinedSection({
        branchCompare: null,
        commitCompare: null,
        isAllMode: true,
        isBranchMode: false,
        isCommitMode: false,
        section: section()
      })
    ).toBeUndefined()
    expect(
      diffComparisonForCombinedSection({
        branchCompare: null,
        commitCompare: null,
        isAllMode: false,
        isBranchMode: true,
        isCommitMode: false,
        section: section()
      })
    ).toBeUndefined()
  })

  it('uses the commit snapshot in commit mode', () => {
    expect(
      diffComparisonForCombinedSection({
        branchCompare: BRANCH,
        commitCompare: COMMIT,
        isAllMode: false,
        isBranchMode: false,
        isCommitMode: true,
        section: section()
      })
    ).toEqual({ kind: 'commit', commitOid: 'commit00', parentOid: 'parent00' })
  })
})
