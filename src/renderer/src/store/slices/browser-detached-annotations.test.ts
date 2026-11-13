import { afterEach, describe, expect, it, vi } from 'vitest'
import { GRAB_BUDGET } from '../../../../shared/browser-grab-types'
import { createBrowserMockApi } from './browser-slice-test-harness'
import { createTestStoreDrawnFromMain } from './browser-slice-drawn-from-main.test-fixture'
import { makeAnnotation } from './browser-annotation-test-fixture'
import { createTestStore as createFullTestStore } from './store-test-helpers'
import {
  getBrowserAnnotationDraft,
  setBrowserAnnotationDraftPayload,
  updateBrowserAnnotationDraftText
} from './browser/browser-annotation-drafts'

vi.mock('@/runtime/runtime-rpc-client', async (importOriginal) =>
  (
    await import('@/runtime/layout-apply-test-transport.test-fixture')
  ).runtimeRpcClientWithLayoutApply(await importOriginal())
)
vi.mock('@/runtime/runtime-layout-client', async (importOriginal) =>
  (
    await import('@/runtime/layout-apply-test-transport.test-fixture')
  ).runtimeLayoutClientWithTestFrames(await importOriginal())
)
vi.mock('@/runtime/web-runtime-browser-creation', () => ({
  createWebRuntimeSessionBrowserTab: vi.fn()
}))

async function createAnnotatedPage(noteIds = ['annotation-1']) {
  vi.stubGlobal('window', { api: createBrowserMockApi(vi.fn()) })
  const { store, main } = await createTestStoreDrawnFromMain({ repos: [], folderWorkspaces: [] })
  const workspace = store.getState().createBrowserTab('wt-1', 'https://example.com/')
  await main.settle()
  const pageId = workspace.activePageId
  if (!pageId) {
    throw new Error('Expected browser page')
  }
  for (const id of noteIds) {
    store.getState().addBrowserPageAnnotation(makeAnnotation(pageId, id))
  }
  return { store, main, workspace, pageId }
}

type Store = Awaited<ReturnType<typeof createAnnotatedPage>>['store']

function detachedNoteIds(store: Store): string[][] {
  return (store.getState().detachedBrowserAnnotationsByWorktree['wt-1'] ?? []).map((group) =>
    group.annotations.map((note) => note.id)
  )
}

function activePageId(store: Store, workspaceId: string): string {
  const pageId = store
    .getState()
    .browserTabsByWorktree['wt-1']?.find((tab) => tab.id === workspaceId)?.activePageId
  if (!pageId) {
    throw new Error('Expected an active page')
  }
  return pageId
}

afterEach(() => vi.unstubAllGlobals())

describe('unsent browser notes never vanish with their page', () => {
  it.each([
    ['closing the tab', 'tab'],
    ['closing the page', 'page'],
    ['putting the worktree to sleep', 'sleep']
  ] as const)('keeps the notes on the worktree after %s', async (_label, how) => {
    const { store, main, workspace, pageId } = await createAnnotatedPage()
    if (how === 'tab') {
      store.getState().closeBrowserTab(workspace.id)
    } else if (how === 'page') {
      store.getState().closeBrowserPage(pageId)
    } else {
      store.getState().shutdownWorktreeBrowsers('wt-1')
    }
    await main.settle()

    expect(store.getState().browserAnnotationsByPageId[pageId]).toBeUndefined()
    const [group] = store.getState().detachedBrowserAnnotationsByWorktree['wt-1'] ?? []
    expect(group?.origin).toMatchObject({ pageId, url: 'https://example.com/' })
    expect(group?.annotations).toEqual([makeAnnotation(pageId)])
  })

  it.each([
    ['closing the tab', 'tab'],
    ['closing the page', 'page'],
    ['putting the worktree to sleep', 'sleep']
  ] as const)('keeps a typed draft as a detached note after %s', async (_label, how) => {
    const { store, main, workspace, pageId } = await createAnnotatedPage([])
    setBrowserAnnotationDraftPayload(pageId, makeAnnotation(pageId).payload)
    updateBrowserAnnotationDraftText(pageId, {
      comment: '  Half typed  ',
      intent: 'question',
      imagePaths: []
    })
    if (how === 'tab') {
      store.getState().closeBrowserTab(workspace.id)
    } else if (how === 'page') {
      store.getState().closeBrowserPage(pageId)
    } else {
      store.getState().shutdownWorktreeBrowsers('wt-1')
    }
    await main.settle()

    const [group] = store.getState().detachedBrowserAnnotationsByWorktree['wt-1'] ?? []
    expect(group?.annotations).toMatchObject([
      { browserPageId: pageId, comment: 'Half typed', intent: 'question' }
    ])
    expect(getBrowserAnnotationDraft(pageId)).toBeUndefined()
  })

  it('forgets an untyped draft when its page closes, without inventing a note', async () => {
    const { store, main, workspace, pageId } = await createAnnotatedPage([])
    setBrowserAnnotationDraftPayload(pageId, makeAnnotation(pageId).payload)
    store.getState().closeBrowserTab(workspace.id)
    await main.settle()

    expect(store.getState().detachedBrowserAnnotationsByWorktree['wt-1'] ?? []).toEqual([])
    expect(getBrowserAnnotationDraft(pageId)).toBeUndefined()
  })

  it('puts the notes back on the reopened tab under its new page id', async () => {
    const { store, main, workspace, pageId } = await createAnnotatedPage()
    store.getState().closeBrowserTab(workspace.id)
    await main.settle()

    const reopened = store.getState().reopenClosedBrowserTab('wt-1')
    await main.settle()
    if (!reopened) {
      throw new Error('Expected a reopened tab')
    }
    const newPageId = activePageId(store, reopened.id)

    expect(newPageId).not.toBe(pageId)
    expect(store.getState().browserAnnotationsByPageId[newPageId]).toEqual([
      { ...makeAnnotation(pageId), browserPageId: newPageId }
    ])
    expect(store.getState().detachedBrowserAnnotationsByWorktree['wt-1']).toBeUndefined()
  })

  it('puts the notes back on a reopened page', async () => {
    const { store, main, workspace, pageId } = await createAnnotatedPage()
    store.getState().createBrowserPage(workspace.id, 'https://example.com/other')
    await main.settle()
    store.getState().closeBrowserPage(pageId)
    await main.settle()

    const reopened = store.getState().reopenClosedBrowserPage(workspace.id)
    await main.settle()

    expect(reopened && store.getState().browserAnnotationsByPageId[reopened.id]).toHaveLength(1)
    expect(detachedNoteIds(store)).toEqual([])
  })

  it('leaves the notes past the page cap detached instead of dropping them', async () => {
    const { store, main, workspace } = await createAnnotatedPage(['old-1', 'old-2'])
    store.getState().closeBrowserTab(workspace.id)
    await main.settle()
    const fresh = store.getState().createBrowserTab('wt-1', 'https://example.com/')
    await main.settle()
    const freshPageId = activePageId(store, fresh.id)
    for (let i = 0; i < GRAB_BUDGET.annotationsMaxPerPage - 1; i++) {
      store.getState().addBrowserPageAnnotation(makeAnnotation(freshPageId, `fresh-${i}`))
    }
    const groupId = store.getState().detachedBrowserAnnotationsByWorktree['wt-1']?.[0]?.id ?? ''

    store.getState().reattachDetachedBrowserNotes('wt-1', groupId, freshPageId)

    expect(store.getState().browserAnnotationsByPageId[freshPageId]).toHaveLength(
      GRAB_BUDGET.annotationsMaxPerPage
    )
    expect(detachedNoteIds(store)).toEqual([['old-2']])
  })

  it('reopens a detached group in a new tab on its origin', async () => {
    const { store, main, workspace } = await createAnnotatedPage()
    store.getState().closeBrowserTab(workspace.id)
    await main.settle()
    const groupId = store.getState().detachedBrowserAnnotationsByWorktree['wt-1']?.[0]?.id ?? ''

    const tab = store.getState().reopenDetachedBrowserNotes('wt-1', groupId)
    await main.settle()

    expect(tab?.url).toBe('https://example.com/')
    expect(
      tab && store.getState().browserAnnotationsByPageId[activePageId(store, tab.id)]
    ).toHaveLength(1)
    expect(store.getState().detachedBrowserAnnotationsByWorktree['wt-1']).toBeUndefined()
  })

  it('drops detached notes only when the worktree itself is purged', async () => {
    const { store, main, workspace } = await createAnnotatedPage()
    store.getState().closeBrowserTab(workspace.id)
    await main.settle()
    const detached = store.getState().detachedBrowserAnnotationsByWorktree
    const full = createFullTestStore()
    full.setState({
      detachedBrowserAnnotationsByWorktree: { ...detached, 'wt-2': detached['wt-1'] }
    })

    full.getState().purgeWorktreeTerminalState(['wt-1'])

    expect(Object.keys(full.getState().detachedBrowserAnnotationsByWorktree)).toEqual(['wt-2'])
  })

  it('moves the notes to the new page when a page converts to a workspace document', async () => {
    const { store, main, pageId } = await createAnnotatedPage()
    const converted = store.getState().convertBrowserPage(pageId, {
      kind: 'workspace-doc',
      docLocation: { kind: 'workspace-doc', worktreeId: 'wt-1', filePath: '/workspace/index.html' }
    })
    await main.settle()

    expect(converted && store.getState().browserAnnotationsByPageId[converted.id]).toEqual([
      { ...makeAnnotation(pageId), browserPageId: converted?.id }
    ])
  })
})
