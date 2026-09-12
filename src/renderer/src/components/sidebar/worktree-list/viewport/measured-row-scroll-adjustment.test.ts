import { describe, expect, it } from 'vitest'
import {
  shouldAdjustWorktreeSidebarMeasuredRowScroll,
  type MeasuredRowScrollAdjustmentArgs
} from './measured-row-scroll-adjustment'

type FoldRow = Omit<MeasuredRowScrollAdjustmentArgs, 'isScrolling' | 'now' | 'suppressUntil'>

/** A re-measured row entirely above the fold, so only the suppression gates decide. */
const aboveTheFold: FoldRow = {
  itemStart: 0,
  itemEnd: 36,
  scrollOffset: 200,
  isFirstMeasure: false,
  // Production's only value once the gates are open: virtual-core clears the direction
  // whenever isScrolling goes false.
  scrollDirection: null
}

describe('shouldAdjustWorktreeSidebarMeasuredRowScroll', () => {
  it('suppresses measured-row scroll correction while TanStack is scrolling', () => {
    expect(
      shouldAdjustWorktreeSidebarMeasuredRowScroll({
        ...aboveTheFold,
        isScrolling: true,
        now: 1_000,
        suppressUntil: 0
      })
    ).toBe(false)
  })

  it('suppresses measured-row scroll correction during direct scroll input grace period', () => {
    expect(
      shouldAdjustWorktreeSidebarMeasuredRowScroll({
        ...aboveTheFold,
        isScrolling: false,
        now: 1_000,
        suppressUntil: 1_250
      })
    ).toBe(false)
  })

  it('allows measured-row scroll correction after direct scrolling settles', () => {
    expect(
      shouldAdjustWorktreeSidebarMeasuredRowScroll({
        ...aboveTheFold,
        isScrolling: false,
        now: 1_500,
        suppressUntil: 1_250
      })
    ).toBe(true)
  })

  it('applies virtual-core fold rule once the suppression gates are open', () => {
    // Fold at 200, gates open for every row. The `<` / `<=` asymmetry is virtual-core's:
    // a row starting exactly at the fold is not above it, one ending there is.
    const rows: Record<string, FoldRow> = {
      'first measure, top above the fold': { ...aboveTheFold, isFirstMeasure: true },
      'first measure, top exactly at the fold': {
        ...aboveTheFold,
        isFirstMeasure: true,
        itemStart: 200,
        itemEnd: 236
      },
      'first measure, top below the fold': {
        ...aboveTheFold,
        isFirstMeasure: true,
        itemStart: 300,
        itemEnd: 336
      },
      're-measure, entirely above the fold': aboveTheFold,
      're-measure, bottom exactly at the fold': { ...aboveTheFold, itemStart: 164, itemEnd: 200 },
      // The expanding-card case, and the one this fix exists for.
      're-measure, spanning the fold': { ...aboveTheFold, itemStart: 180, itemEnd: 260 },
      're-measure, below the fold': { ...aboveTheFold, itemStart: 300, itemEnd: 380 },
      // Unreachable from the sidebar; kept because the rule mirrors virtual-core's.
      're-measure above the fold, scrolling backward': {
        ...aboveTheFold,
        scrollDirection: 'backward'
      }
    }
    const verdicts = Object.fromEntries(
      Object.entries(rows).map(([name, row]) => [
        name,
        shouldAdjustWorktreeSidebarMeasuredRowScroll({
          ...row,
          isScrolling: false,
          now: 1_500,
          suppressUntil: 0
        })
      ])
    )

    expect(verdicts).toEqual({
      'first measure, top above the fold': true,
      'first measure, top exactly at the fold': false,
      'first measure, top below the fold': false,
      're-measure, entirely above the fold': true,
      're-measure, bottom exactly at the fold': true,
      're-measure, spanning the fold': false,
      're-measure, below the fold': false,
      're-measure above the fold, scrolling backward': false
    })
  })
})
