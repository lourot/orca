import type { Virtualizer, VirtualItem } from '@tanstack/react-virtual'
import type { shouldAdjustWorktreeSidebarMeasuredRowScroll } from './use-scroll-suppression'

export type MeasuredRowScrollAdjustmentArgs = Parameters<
  typeof shouldAdjustWorktreeSidebarMeasuredRowScroll
>[0]

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
    // virtual-core asks before it caches the new size, so a cache miss means first paint.
    isFirstMeasurement: !instance.itemSizeCache.has(item.key),
    scrollDirection: instance.scrollDirection
  }
}
