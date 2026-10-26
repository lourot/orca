// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FsChangedPayload } from '../../../../shared/filesystem-entry-types'
import type { FileSearchRoot } from './file-search-scope'
import type { GlobalFileSearchResult } from './useGlobalFileSearchRunner'
import { useFileSearchStaleWatch } from './use-file-search-stale-watch'

const mocks = vi.hoisted(() => ({
  setFileSearchWatchWorktreeIds: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ setFileSearchWatchWorktreeIds: mocks.setFileSearchWatchWorktreeIds })
}))

type HookArgs = Parameters<typeof useFileSearchStaleWatch>[0]

const OPTIONS = {
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
  includePattern: '',
  excludePattern: ''
}

function makeRoot(id: string): FileSearchRoot {
  return {
    id,
    worktreeId: `wt-${id}`,
    repoId: 'repo',
    path: `/roots/${id}`,
    repoName: 'repo',
    worktreeName: id,
    executionHostId: 'local'
  }
}

function makeGlobalResults(matchedRootIds: string[]): GlobalFileSearchResult {
  return {
    groups: matchedRootIds.map((id) => ({
      id,
      label: id,
      detail: 'repo',
      owner: { worktreeId: `wt-${id}`, runtimeEnvironmentId: null, rootPath: `/roots/${id}` },
      result: { files: [], totalMatches: 1, truncated: false }
    })),
    totalMatches: matchedRootIds.length,
    totalFiles: matchedRootIds.length,
    truncated: false,
    unavailableRootCount: 0
  }
}

function makeArgs(overrides: Partial<HookArgs> = {}): HookArgs {
  return {
    scope: 'current',
    explorerView: 'search',
    activeWorktreeId: 'wt-active',
    worktreePath: '/repo',
    roots: [],
    hasCurrentResults: true,
    currentResultOwner: { worktreeId: 'wt-active', runtimeEnvironmentId: null, rootPath: '/repo' },
    currentResultsStale: false,
    globalResults: null,
    globalResultsStale: false,
    loading: false,
    updateCurrentSearchState: vi.fn(),
    updateGlobalSearchState: vi.fn(),
    query: 'needle',
    options: OPTIONS,
    executeCurrentSearch: vi.fn(),
    executeGlobalSearch: vi.fn(),
    ...overrides
  }
}

function emitFileChange(payload: FsChangedPayload, runtimeEnvironmentId: string | null): void {
  act(() => {
    window.dispatchEvent(
      new CustomEvent('orca:worktree-file-change', { detail: { payload, runtimeEnvironmentId } })
    )
  })
}

describe('useFileSearchStaleWatch', () => {
  beforeEach(() => {
    mocks.setFileSearchWatchWorktreeIds.mockReset()
  })

  it.each([
    {
      name: 'a file update under the searched root',
      payload: { worktreePath: '/repo', events: [{ kind: 'update', absolutePath: '/repo/a.ts' }] },
      eventRuntime: null,
      marksStale: true
    },
    {
      name: 'a watcher overflow on the searched root',
      payload: { worktreePath: '/repo', events: [{ kind: 'overflow', absolutePath: '/repo' }] },
      eventRuntime: null,
      marksStale: true
    },
    {
      name: 'a directory-only event',
      payload: {
        worktreePath: '/repo',
        events: [{ kind: 'create', absolutePath: '/repo/src', isDirectory: true }]
      },
      eventRuntime: null,
      marksStale: false
    },
    {
      name: 'a change under another root',
      payload: {
        worktreePath: '/other',
        events: [{ kind: 'update', absolutePath: '/other/a.ts' }]
      },
      eventRuntime: null,
      marksStale: false
    },
    {
      name: 'the same path on another runtime environment',
      payload: { worktreePath: '/repo', events: [{ kind: 'update', absolutePath: '/repo/a.ts' }] },
      eventRuntime: 'runtime-b',
      marksStale: false
    },
    {
      name: 'a change on the runtime environment that produced the results',
      payload: { worktreePath: '/srv', events: [{ kind: 'update', absolutePath: '/srv/a.ts' }] },
      ownerRuntime: 'runtime-b',
      eventRuntime: 'runtime-b',
      marksStale: true
    },
    {
      name: 'a local change when the results came from a runtime environment',
      payload: { worktreePath: '/srv', events: [{ kind: 'update', absolutePath: '/srv/a.ts' }] },
      ownerRuntime: 'runtime-b',
      eventRuntime: null,
      marksStale: false
    }
  ] satisfies {
    name: string
    payload: FsChangedPayload
    ownerRuntime?: string
    eventRuntime: string | null
    marksStale: boolean
  }[])(
    'current scope: $name marks stale = $marksStale',
    ({ payload, ownerRuntime, eventRuntime, marksStale }) => {
      const args = makeArgs(
        ownerRuntime
          ? {
              currentResultOwner: {
                worktreeId: 'wt-active',
                runtimeEnvironmentId: ownerRuntime,
                rootPath: '/srv'
              }
            }
          : {}
      )
      renderHook(() => useFileSearchStaleWatch(args))
      vi.mocked(args.updateCurrentSearchState).mockClear()

      emitFileChange(payload, eventRuntime)

      expect(vi.mocked(args.updateCurrentSearchState).mock.calls).toEqual(
        marksStale ? [[{ resultsStale: true }]] : []
      )
    }
  )

  it('marks kept results stale when Search is shown, and nothing without results', () => {
    const withResults = makeArgs({ explorerView: 'files' })
    const hook = renderHook((props: HookArgs) => useFileSearchStaleWatch(props), {
      initialProps: withResults
    })
    expect(withResults.updateCurrentSearchState).not.toHaveBeenCalled()
    hook.rerender({ ...withResults, explorerView: 'search' })
    expect(withResults.updateCurrentSearchState).toHaveBeenCalledWith({ resultsStale: true })

    const withoutResults = makeArgs({ hasCurrentResults: false })
    renderHook(() => useFileSearchStaleWatch(withoutResults))
    expect(withoutResults.updateCurrentSearchState).not.toHaveBeenCalled()
  })

  it('applies a change seen while a search runs once that search finishes, and only then', () => {
    const update = {
      worktreePath: '/repo',
      events: [{ kind: 'update', absolutePath: '/repo/a.ts' }]
    } satisfies FsChangedPayload
    // Refresh on stale results: the old results stay shown while the new search runs.
    const args = makeArgs({ currentResultsStale: true, loading: true })
    const hook = renderHook((props: HookArgs) => useFileSearchStaleWatch(props), {
      initialProps: args
    })
    vi.mocked(args.updateCurrentSearchState).mockClear()

    emitFileChange(update, null)
    expect(args.updateCurrentSearchState).not.toHaveBeenCalled()
    hook.rerender({ ...args, currentResultsStale: false, loading: false })
    expect(vi.mocked(args.updateCurrentSearchState).mock.calls).toEqual([[{ resultsStale: true }]])

    vi.mocked(args.updateCurrentSearchState).mockClear()
    hook.rerender({ ...args, currentResultsStale: false, loading: true })
    hook.rerender({ ...args, currentResultsStale: false, loading: false })
    expect(args.updateCurrentSearchState).not.toHaveBeenCalled()
  })

  it.each([
    { scope: 'current', marksStale: true },
    { scope: 'all-worktrees', marksStale: false }
  ] as const)(
    'switching workspace in $scope scope marks kept results stale = $marksStale',
    ({ scope, marksStale }) => {
      const args = makeArgs({
        scope,
        globalResults: makeGlobalResults(['a']),
        roots: [makeRoot('a')]
      })
      const hook = renderHook((props: HookArgs) => useFileSearchStaleWatch(props), {
        initialProps: args
      })
      vi.mocked(args.updateCurrentSearchState).mockClear()
      vi.mocked(args.updateGlobalSearchState).mockClear()

      hook.rerender({ ...args, activeWorktreeId: 'wt-other' })

      const marked =
        scope === 'current' ? args.updateCurrentSearchState : args.updateGlobalSearchState
      expect(vi.mocked(marked).mock.calls).toEqual(marksStale ? [[{ resultsStale: true }]] : [])
    }
  )

  it('multi-workspace scope watches capped roots, matched first, and reports the rest untracked', () => {
    const roots = Array.from({ length: 34 }, (_, index) => makeRoot(`r${index}`))
    const args = makeArgs({
      scope: 'all-worktrees',
      roots,
      globalResults: makeGlobalResults(['r33'])
    })
    const { result } = renderHook(() => useFileSearchStaleWatch(args))

    const watchedIds = mocks.setFileSearchWatchWorktreeIds.mock.lastCall?.[0]
    expect(watchedIds).toHaveLength(32)
    expect(watchedIds?.[0]).toBe('wt-r33')
    expect(result.current.untrackedRootCount).toBe(2)

    vi.mocked(args.updateGlobalSearchState).mockClear()
    // r32 is past the cap: unwatched, so it never reaches the bar.
    emitFileChange(
      { worktreePath: '/roots/r32', events: [{ kind: 'update', absolutePath: '/roots/r32/a' }] },
      null
    )
    expect(args.updateGlobalSearchState).not.toHaveBeenCalled()
    emitFileChange(
      { worktreePath: '/roots/r33', events: [{ kind: 'update', absolutePath: '/roots/r33/a' }] },
      null
    )
    expect(args.updateGlobalSearchState).toHaveBeenCalledWith({ resultsStale: true })
    expect(args.updateCurrentSearchState).not.toHaveBeenCalled()
  })

  it('stops watching multi-workspace roots on unmount', () => {
    const args = makeArgs({
      scope: 'all-primary',
      roots: [makeRoot('a')],
      globalResults: makeGlobalResults(['a'])
    })
    const hook = renderHook(() => useFileSearchStaleWatch(args))
    hook.unmount()

    expect(mocks.setFileSearchWatchWorktreeIds.mock.lastCall).toEqual([[]])
  })

  it.each([
    { scope: 'current', executor: 'executeCurrentSearch', expectedArgs: ['needle'] },
    { scope: 'all-worktrees', executor: 'executeGlobalSearch', expectedArgs: ['needle', OPTIONS] }
  ] as const)(
    'Refresh in $scope scope re-runs the query via $executor',
    ({ scope, executor, expectedArgs }) => {
      const args = makeArgs({ scope })
      const { result } = renderHook(() => useFileSearchStaleWatch(args))

      result.current.onRefresh()

      expect(args[executor]).toHaveBeenCalledWith(...expectedArgs)
    }
  )
})
