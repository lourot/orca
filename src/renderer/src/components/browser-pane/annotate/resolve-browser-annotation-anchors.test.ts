import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestStore } from '@/store/slices/browser-slice-test-harness'
import { makeAnnotation } from '@/store/slices/browser-annotation-test-fixture'
import type { BrowserResolvedAnnotationAnchor } from '../../../../../shared/browser-annotation-anchor-resolution'

const state = vi.hoisted((): { store?: ReturnType<typeof createTestStore> } => ({}))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => state.store?.getState() }
}))

const { resolveBrowserAnnotationAnchors } = await import('./resolve-browser-annotation-anchors')

const rect = { x: 0, y: 600, width: 10, height: 10 }
const found: BrowserResolvedAnnotationAnchor = {
  id: 'annotation-1',
  isFixed: false,
  rectPage: rect,
  rectViewport: rect
}

function setUp(answers: BrowserResolvedAnnotationAnchor[][]) {
  state.store = createTestStore()
  const workspace = state.store.getState().createBrowserTab('wt-1', 'https://example.com')
  const pageId = workspace.activePageId ?? ''
  state.store.getState().addBrowserPageAnnotation(makeAnnotation(pageId), { measured: false })
  const resolve = vi.fn()
  for (const answer of answers) {
    resolve.mockResolvedValueOnce(answer)
  }
  vi.stubGlobal('window', { api: { browser: { resolveAnnotationAnchors: resolve } } })
  return { pageId, resolve, store: state.store }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('finding notes again after a load', () => {
  it('keeps looking while a client-rendered page mounts, without flagging notes meanwhile', async () => {
    const { pageId, resolve, store } = setUp([[], [found]])

    const done = resolveBrowserAnnotationAnchors({ pageId, toolTargetId: pageId })
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState().browserAnnotationAnchorsByPageId[pageId]).toBeUndefined()
    await vi.advanceTimersByTimeAsync(500)
    await done

    expect(resolve).toHaveBeenCalledTimes(2)
    expect(store.getState().browserAnnotationAnchorsByPageId[pageId]).toEqual({
      'annotation-1': found
    })
  })

  it('records "not found" only after the last attempt', async () => {
    const { pageId, store } = setUp([[], [], [], []])

    const done = resolveBrowserAnnotationAnchors({ pageId, toolTargetId: pageId })
    await vi.advanceTimersByTimeAsync(6_000)
    await done

    expect(store.getState().browserAnnotationAnchorsByPageId[pageId]).toEqual({})
  })
})
