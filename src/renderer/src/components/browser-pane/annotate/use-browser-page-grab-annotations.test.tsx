// @vitest-environment happy-dom
import { useLayoutEffect } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestStore } from '@/store/slices/browser-slice-test-harness'
import { makeAnnotation } from '@/store/slices/browser-annotation-test-fixture'
import {
  GRAB_BUDGET,
  type BrowserGrabResult,
  type BrowserCaptureSelectionScreenshotResult
} from '../../../../../shared/browser-grab-types'
import { useGrabMode } from './useGrabMode'
import { useBrowserPageGrabAnnotations } from './use-browser-page-grab-annotations'
import { useBrowserAnnotationDraftSync } from './use-browser-annotation-draft-sync'
import { deleteBrowserAnnotationDrafts } from '@/store/slices/browser/browser-annotation-drafts'

const state = vi.hoisted((): { store?: ReturnType<typeof createTestStore> } => ({}))
vi.mock('@/store', () => ({
  useAppStore: (
    selector: (value: ReturnType<ReturnType<typeof createTestStore>['getState']>) => unknown
  ) => {
    if (!state.store) {
      throw new Error('Missing test store')
    }
    return state.store(selector)
  }
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

beforeEach(() => {
  state.store = createTestStore()
})
afterEach(() => {
  cleanup()
  deleteBrowserAnnotationDrafts(['page-1'])
  Reflect.deleteProperty(window, 'api')
})

function mount(invalidateBeforePendingEffect = false, browserAnnotationsLength = 0) {
  const selection = deferred<BrowserGrabResult>()
  const screenshot = deferred<BrowserCaptureSelectionScreenshotResult>()
  const awaitGrabSelection = vi
    .fn()
    .mockReturnValueOnce(selection.promise)
    .mockReturnValue(new Promise(() => {}))
  const captureSelectionScreenshot = vi.fn().mockReturnValue(screenshot.promise)
  const cancelGrab = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      browser: {
        setGrabMode: vi.fn().mockResolvedValue({ ok: true }),
        awaitGrabSelection,
        captureSelectionScreenshot,
        cancelGrab
      }
    }
  })
  const containerRef = { current: null }
  const webviewRef = { current: null }
  const setBrowserOverlayViewport = vi.fn()
  const hook = renderHook(() => {
    const grab = useGrabMode('page-1')
    const annotations = useBrowserPageGrabAnnotations({
      browserTabId: 'page-1',
      isActive: false,
      grab,
      containerRef,
      webviewRef,
      setBrowserOverlayViewport,
      browserAnnotationsLength
    })
    const { cancelPendingBrowserCapture } = annotations
    useLayoutEffect(() => {
      if (invalidateBeforePendingEffect && grab.state === 'confirming') {
        cancelPendingBrowserCapture()
      }
    }, [grab.state, cancelPendingBrowserCapture])
    const draft = useBrowserAnnotationDraftSync('page-1', annotations.pendingAnnotationPayload)
    return { grab, annotations, draft }
  })
  return {
    ...hook,
    selection,
    screenshot,
    awaitGrabSelection,
    captureSelectionScreenshot,
    cancelGrab
  }
}

function selected(): BrowserGrabResult {
  return { opId: 'fixture-op', kind: 'selected', payload: makeAnnotation('page-1').payload }
}

describe('capture cancellation on a document boundary', () => {
  it('does not restore pending capture when loading cancels between commit and passive effects', async () => {
    const h = mount(true)
    act(() => h.result.current.annotations.startGrabIntent('annotate'))
    await waitFor(() => expect(h.awaitGrabSelection).toHaveBeenCalledOnce())
    await act(async () => {
      h.selection.resolve(selected())
      h.screenshot.resolve({ ok: false, reason: 'fixture' })
      await h.screenshot.promise
    })
    expect(h.result.current.grab.state).toBe('idle')
    expect(h.result.current.annotations.pendingAnnotationPayload).toBeNull()
    await act(() =>
      h.result.current.annotations.handleAddBrowserAnnotation('Canceled capture', 'fix')
    )
    expect(state.store?.getState().browserAnnotationsByPageId['page-1']).toBeUndefined()
    expect(state.store?.getState().browserAnnotationMarkerIdsByPageId['page-1']).toBeUndefined()
  })

  it('ignores a same-page selection that completes after document invalidation', async () => {
    const h = mount()
    act(() => h.result.current.annotations.startGrabIntent('annotate'))
    await waitFor(() => expect(h.awaitGrabSelection).toHaveBeenCalledOnce())
    act(() => h.result.current.annotations.cancelPendingBrowserCapture())
    await act(async () => {
      h.selection.resolve(selected())
      await h.selection.promise
    })
    expect(h.cancelGrab).toHaveBeenCalledWith({ browserPageId: 'page-1' })
    expect(h.captureSelectionScreenshot).not.toHaveBeenCalled()
    expect(h.result.current.grab.state).toBe('idle')
    expect(h.result.current.annotations.pendingAnnotationPayload).toBeNull()
    expect(state.store?.getState().browserAnnotationsByPageId['page-1']).toBeUndefined()
  })

  it('ignores a same-URL screenshot that finishes after cancellation without creating eligible geometry', async () => {
    const h = mount()
    act(() => h.result.current.annotations.startGrabIntent('annotate'))
    await waitFor(() => expect(h.awaitGrabSelection).toHaveBeenCalledOnce())
    await act(async () => {
      h.selection.resolve(selected())
      await h.selection.promise
    })
    expect(h.captureSelectionScreenshot).toHaveBeenCalledOnce()
    act(() => h.result.current.annotations.cancelPendingBrowserCapture())
    await act(async () => {
      h.screenshot.resolve({ ok: false, reason: 'fixture' })
      await h.screenshot.promise
    })
    expect(h.result.current.grab.state).toBe('idle')
    expect(h.result.current.annotations.pendingAnnotationPayload).toBeNull()
    expect(state.store?.getState().browserAnnotationMarkerIdsByPageId['page-1']).toBeUndefined()
  })

  it('blocks an already-rendered Add callback after invalidation and permits a fresh capture', async () => {
    const h = mount()
    act(() => h.result.current.annotations.startGrabIntent('annotate'))
    await waitFor(() => expect(h.awaitGrabSelection).toHaveBeenCalledOnce())
    await act(async () => {
      h.selection.resolve(selected())
      h.screenshot.resolve({ ok: false, reason: 'fixture' })
      await h.screenshot.promise
    })
    await waitFor(() =>
      expect(h.result.current.annotations.pendingAnnotationPayload).not.toBeNull()
    )
    const oldAdd = h.result.current.annotations.handleAddBrowserAnnotation
    act(() => {
      h.result.current.annotations.cancelPendingBrowserCapture()
      oldAdd('Stale note', 'fix')
    })
    expect(state.store?.getState().browserAnnotationsByPageId['page-1']).toBeUndefined()

    const fresh = deferred<BrowserGrabResult>()
    h.awaitGrabSelection.mockReturnValueOnce(fresh.promise)
    act(() => h.result.current.annotations.startGrabIntent('annotate'))
    await waitFor(() => expect(h.awaitGrabSelection).toHaveBeenCalledTimes(2))
    await act(async () => {
      fresh.resolve(selected())
      await fresh.promise
    })
    await waitFor(() =>
      expect(h.result.current.annotations.pendingAnnotationPayload).not.toBeNull()
    )
    await act(() => h.result.current.annotations.handleAddBrowserAnnotation('Fresh note', 'change'))
    const saved = state.store?.getState().browserAnnotationsByPageId['page-1']
    expect(saved).toHaveLength(1)
    expect(saved?.[0].comment).toBe('Fresh note')
    expect(state.store?.getState().browserAnnotationMarkerIdsByPageId['page-1']).toEqual([
      saved?.[0].id
    ])
  })
})

describe('draft kept across a document reload', () => {
  it('keeps a typed draft unanchored when its document reloads, and still saves it', async () => {
    const h = mount()
    act(() => h.result.current.annotations.startGrabIntent('annotate'))
    await waitFor(() => expect(h.awaitGrabSelection).toHaveBeenCalledOnce())
    await act(async () => {
      h.selection.resolve(selected())
      h.screenshot.resolve({ ok: false, reason: 'fixture' })
      await h.screenshot.promise
    })
    await waitFor(() =>
      expect(h.result.current.annotations.pendingAnnotationPayload).not.toBeNull()
    )
    act(() => h.result.current.annotations.detachPendingBrowserCapture())
    expect(h.result.current.grab.state).toBe('idle')
    expect(h.result.current.annotations.pendingAnnotationPayload).not.toBeNull()
    expect(h.result.current.annotations.pendingAnnotationUnanchored).toBe(true)

    await act(() =>
      h.result.current.annotations.handleAddBrowserAnnotation('Survived reload', 'fix')
    )
    const saved = state.store?.getState().browserAnnotationsByPageId['page-1']
    expect(saved?.map((annotation) => annotation.comment)).toEqual(['Survived reload'])
    // Its geometry predates this document, so it must be found again rather than drawn there.
    expect(state.store?.getState().browserAnnotationMarkerIdsByPageId['page-1']).toBeUndefined()
    expect(h.result.current.annotations.pendingAnnotationPayload).toBeNull()
    expect(h.result.current.annotations.pendingAnnotationUnanchored).toBe(false)
  })
})

describe('draft kept while its worktree is inactive', () => {
  async function openDraft() {
    const h = mount()
    act(() => h.result.current.annotations.startGrabIntent('annotate'))
    await waitFor(() => expect(h.awaitGrabSelection).toHaveBeenCalledOnce())
    await act(async () => {
      h.selection.resolve(selected())
      h.screenshot.resolve({ ok: false, reason: 'fixture' })
      await h.screenshot.promise
    })
    await waitFor(() =>
      expect(h.result.current.annotations.pendingAnnotationPayload).not.toBeNull()
    )
    return h
  }

  it('brings the typed draft back unanchored when the pane mounts again, and still saves it', async () => {
    const h = await openDraft()
    act(() =>
      h.result.current.draft.onDraftChange({
        comment: 'Half typed',
        intent: 'question',
        imagePaths: ['/tmp/pasted.png']
      })
    )
    h.unmount()

    const back = mount()
    expect(back.result.current.annotations.pendingAnnotationUnanchored).toBe(true)
    expect(back.result.current.draft.initialDraft).toEqual({
      comment: 'Half typed',
      intent: 'question',
      imagePaths: ['/tmp/pasted.png']
    })
    await act(() =>
      back.result.current.annotations.handleAddBrowserAnnotation('Half typed, done', 'question')
    )
    const saved = state.store?.getState().browserAnnotationsByPageId['page-1']
    expect(saved?.map((annotation) => annotation.comment)).toEqual(['Half typed, done'])
    expect(state.store?.getState().browserAnnotationMarkerIdsByPageId['page-1']).toBeUndefined()
  })

  it('does not bring back a draft that was cancelled', async () => {
    const h = await openDraft()
    act(() => h.result.current.annotations.handleCancelPendingBrowserAnnotation())
    h.unmount()

    const back = mount()
    expect(back.result.current.annotations.pendingAnnotationPayload).toBeNull()
    expect(back.result.current.draft.initialDraft).toBeUndefined()
  })
})

describe('per-page annotation limit', () => {
  it('tells the user the page is full instead of opening a draft that cannot be saved', async () => {
    const h = mount(false, GRAB_BUDGET.annotationsMaxPerPage)
    act(() => h.result.current.annotations.startGrabIntent('annotate'))
    await waitFor(() => expect(h.awaitGrabSelection).toHaveBeenCalledOnce())
    await act(async () => {
      h.selection.resolve(selected())
      h.screenshot.resolve({ ok: false, reason: 'fixture' })
      await h.screenshot.promise
    })
    await waitFor(() => expect(h.result.current.annotations.grabToast?.type).toBe('error'))
    expect(h.result.current.annotations.pendingAnnotationPayload).toBeNull()
  })

  it('shows no limit toast for a selection that loading cancelled first', async () => {
    const h = mount(true, GRAB_BUDGET.annotationsMaxPerPage)
    act(() => h.result.current.annotations.startGrabIntent('annotate'))
    await waitFor(() => expect(h.awaitGrabSelection).toHaveBeenCalledOnce())
    await act(async () => {
      h.selection.resolve(selected())
      h.screenshot.resolve({ ok: false, reason: 'fixture' })
      await h.screenshot.promise
    })
    expect(h.result.current.grab.state).toBe('idle')
    expect(h.result.current.annotations.grabToast).toBeNull()
  })
})
