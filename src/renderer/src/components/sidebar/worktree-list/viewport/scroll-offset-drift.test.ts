// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  elementScroll,
  observeElementOffset,
  observeElementRect,
  Virtualizer
} from '@tanstack/virtual-core'
import {
  readMeasuredRowScrollAdjustmentArgs,
  shouldAdjustWorktreeSidebarMeasuredRowScroll
} from './measured-row-scroll-adjustment'

const ROW_ESTIMATE = 36
const VIEWPORT_HEIGHT = 800
const GROWTH = 84
const ROW_COUNT = 40

/** Clamps like a real element, so an unreachable scroll target silently stays put. */
function makeScrollElement(contentHeight: number): HTMLDivElement {
  const element = document.createElement('div')
  let scrollTop = 0
  const scrollHeight = Math.max(contentHeight, VIEWPORT_HEIGHT)
  Object.defineProperties(element, {
    clientHeight: { get: () => VIEWPORT_HEIGHT },
    scrollHeight: { get: () => scrollHeight },
    clientWidth: { get: () => 300 },
    scrollWidth: { get: () => 300 },
    scrollTop: {
      get: () => scrollTop,
      set: (next: number) => {
        scrollTop = Math.max(0, Math.min(next, scrollHeight - VIEWPORT_HEIGHT))
      }
    }
  })
  element.scrollTo = ((options: ScrollToOptions) => {
    element.scrollTop = options.top ?? 0
  }) as HTMLDivElement['scrollTo']
  element.getBoundingClientRect = () =>
    ({ width: 300, height: VIEWPORT_HEIGHT, top: 0, left: 0 }) as DOMRect
  document.body.appendChild(element)
  return element
}

/** The production predicate, reading its inputs through the same adapter the sidebar installs. */
const sidebarPredicate: Virtualizer<
  HTMLDivElement,
  Element
>['shouldAdjustScrollPositionOnItemSizeChange'] = (item, _delta, instance) =>
  shouldAdjustWorktreeSidebarMeasuredRowScroll(
    readMeasuredRowScrollAdjustmentArgs(item, instance, {
      now: 1_000,
      suppressUntil: 0,
      fallbackScrollOffset: 0
    })
  )

function mountVirtualizer(args: {
  scrollElement: HTMLDivElement
  initialOffset: number
  /** Undefined keeps virtual-core's own fold rule, which is the control arm. */
  shouldAdjust: Virtualizer<HTMLDivElement, Element>['shouldAdjustScrollPositionOnItemSizeChange']
}): Virtualizer<HTMLDivElement, Element> {
  const virtualizer = new Virtualizer<HTMLDivElement, Element>({
    count: ROW_COUNT,
    getScrollElement: () => args.scrollElement,
    estimateSize: () => ROW_ESTIMATE,
    scrollToFn: elementScroll,
    observeElementRect,
    observeElementOffset,
    getItemKey: (index) => `row-${index}`,
    initialOffset: args.initialOffset,
    overscan: 10,
    onChange: () => {}
  })
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = args.shouldAdjust
  virtualizer._didMount()
  virtualizer._willUpdate()
  virtualizer.getVirtualItems()
  return virtualizer
}

/**
 * A second entry in `resizes` lands on the re-measure branch, because the first is what
 * populates `itemSizeCache`. `rebuildBetween: false` skips the `getVirtualItems()` that
 * refreshes measurements from that cache - two ResizeObserver callbacks in one tick, the
 * window where `item.size` is a revision stale.
 */
function runScenario(args: {
  initialOffset: number
  contentHeight: number
  index: number
  resizes: number[]
  rebuildBetween?: boolean
  shouldAdjust: Virtualizer<HTMLDivElement, Element>['shouldAdjustScrollPositionOnItemSizeChange']
}): { scrollOffset: number | null; scrollTop: number } {
  const scrollElement = makeScrollElement(args.contentHeight)
  const virtualizer = mountVirtualizer({
    scrollElement,
    initialOffset: args.initialOffset,
    shouldAdjust: args.shouldAdjust
  })
  for (const size of args.resizes) {
    virtualizer.resizeItem(args.index, size)
    if (args.rebuildBetween !== false) {
      virtualizer.getVirtualItems()
    }
  }
  return { scrollOffset: virtualizer.scrollOffset, scrollTop: scrollElement.scrollTop }
}

const SHORT_LIST = { initialOffset: 0, contentHeight: 0 }
// 40 rows at 36px still fits 800px of viewport, so give the scrolled cases real content.
const TALL_LIST = { initialOffset: 400, contentHeight: 4_000 }

describe('sidebar virtualizer scroll-offset drift', () => {
  it('keeps the believed offset on the DOM when a row below the fold is re-measured larger', () => {
    // Row 5 starts at y=180, below the fold at offset 0; the second resize is the agent
    // list expanding in place.
    const { scrollOffset, scrollTop } = runScenario({
      ...SHORT_LIST,
      index: 5,
      resizes: [ROW_ESTIMATE + 4, ROW_ESTIMATE + GROWTH],
      shouldAdjust: sidebarPredicate
    })

    expect(scrollTop).toBe(0)
    expect(scrollOffset).toBe(0)
  })

  it("matches virtual-core's own fold rule wherever the suppression gates are open", () => {
    // Why compare arms instead of asserting a literal: our predicate REPLACES the library's
    // rule, so a TanStack upgrade that changes the default would silently desync us.
    const scenarios: Record<string, Omit<Parameters<typeof runScenario>[0], 'shouldAdjust'>> = {
      'short list, row below the fold, first measure': {
        ...SHORT_LIST,
        index: 5,
        resizes: [ROW_ESTIMATE + GROWTH]
      },
      'short list, row below the fold, re-measure': {
        ...SHORT_LIST,
        index: 5,
        resizes: [ROW_ESTIMATE + 4, ROW_ESTIMATE + GROWTH]
      },
      'scrolled, row above the fold, first measure': {
        ...TALL_LIST,
        index: 0,
        resizes: [ROW_ESTIMATE + GROWTH]
      },
      'scrolled, row above the fold, re-measure': {
        ...TALL_LIST,
        index: 0,
        resizes: [ROW_ESTIMATE + 4, ROW_ESTIMATE + GROWTH]
      },
      'scrolled, row spanning the fold, re-measure': {
        ...TALL_LIST,
        index: 11,
        resizes: [ROW_ESTIMATE + 4, ROW_ESTIMATE + GROWTH]
      },
      // The fold falls between the row's stale bottom and its cached one, so reading
      // item.end here would adjust where the library declines.
      'two resizes in one tick, fold between the stale and cached bottom': {
        ...TALL_LIST,
        initialOffset: 430,
        index: 11,
        resizes: [60, 200],
        rebuildBetween: false
      }
    }
    const compared = Object.fromEntries(
      Object.entries(scenarios).map(([name, scenario]) => [
        name,
        {
          sidebar: runScenario({ ...scenario, shouldAdjust: sidebarPredicate }).scrollOffset,
          virtualCore: runScenario({ ...scenario, shouldAdjust: undefined }).scrollOffset
        }
      ])
    )

    expect(compared).toEqual({
      'short list, row below the fold, first measure': { sidebar: 0, virtualCore: 0 },
      'short list, row below the fold, re-measure': { sidebar: 0, virtualCore: 0 },
      // Not all zeroes, so a never-adjust predicate fails this too.
      'scrolled, row above the fold, first measure': { sidebar: 484, virtualCore: 484 },
      'scrolled, row above the fold, re-measure': { sidebar: 484, virtualCore: 484 },
      'scrolled, row spanning the fold, re-measure': { sidebar: 404, virtualCore: 404 },
      'two resizes in one tick, fold between the stale and cached bottom': {
        sidebar: 454,
        virtualCore: 454
      }
    })
  })
})
