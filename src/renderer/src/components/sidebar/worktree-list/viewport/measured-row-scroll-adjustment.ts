import type { Virtualizer, VirtualItem } from '@tanstack/react-virtual'

export type MeasuredRowScrollAdjustmentArgs = {
  isScrolling: boolean
  now: number
  suppressUntil: number
  itemStart: number
  itemEnd: number
  /** Believed offset, including adjustments already booked this tick. */
  scrollOffset: number
  /** virtual-core asks before it caches the new size, so a cache miss means first paint. */
  isFirstMeasure: boolean
  scrollDirection: 'forward' | 'backward' | null
}

// Why: supplying shouldAdjustScrollPositionOnItemSizeChange replaces virtual-core's fold rule
// outright, so the suppression gates have to carry it rather than stand in for it. Without it
// a card growing below the fold books a correction the element cannot honour in a list shorter
// than the viewport, and the believed scrollOffset drifts for good.
export function shouldAdjustWorktreeSidebarMeasuredRowScroll(
  args: MeasuredRowScrollAdjustmentArgs
): boolean {
  if (args.isScrolling || args.now < args.suppressUntil) {
    return false
  }
  if (args.isFirstMeasure) {
    // Why: the whole estimated block sat above the fold, so correct either way.
    return args.itemStart < args.scrollOffset
  }
  // Why: a row spanning the fold grows below the anchor point (TanStack #1218). The backward
  // guard mirrors virtual-core, which has no isScrolling gate; ours already excludes it.
  return args.itemEnd <= args.scrollOffset && args.scrollDirection !== 'backward'
}

/** Shared by the call site and its test, so the mapping onto virtual-core cannot drift. */
export function readMeasuredRowScrollAdjustmentArgs<TScroll extends Element, TItem extends Element>(
  item: VirtualItem,
  instance: Virtualizer<TScroll, TItem>,
  gates: { now: number; suppressUntil: number; fallbackScrollOffset: number }
): MeasuredRowScrollAdjustmentArgs {
  return {
    isScrolling: instance.isScrolling,
    now: gates.now,
    suppressUntil: gates.suppressUntil,
    itemStart: item.start,
    // Why: item.end lags itemSizeCache when two resizes land between measurement rebuilds.
    itemEnd: item.start + (instance.itemSizeCache.get(item.key) ?? item.size),
    // Mirrors virtual-core's getScrollOffset() + scrollAdjustments.
    scrollOffset:
      (instance.scrollOffset ?? gates.fallbackScrollOffset) + instance.scrollAdjustments,
    isFirstMeasure: !instance.itemSizeCache.has(item.key),
    scrollDirection: instance.scrollDirection
  }
}
