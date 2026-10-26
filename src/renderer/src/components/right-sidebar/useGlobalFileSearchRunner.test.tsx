// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchResult } from '../../../../shared/code-search-types'
import type { GlobalFileSearchState } from './useGlobalFileSearchRunner'
import { useGlobalFileSearchRunner } from './useGlobalFileSearchRunner'

const mocks = vi.hoisted(() => ({
  getRuntimeFileSearchRejectedField: vi.fn(),
  runtimeTargetForWorkspaceOwner: vi.fn(),
  searchRuntimeFiles: vi.fn()
}))

vi.mock('@/runtime/runtime-file-search-bounds', () => ({
  getRuntimeFileSearchRejectedField: mocks.getRuntimeFileSearchRejectedField
}))

vi.mock('@/lib/resolve-owner', () => ({
  runtimeTargetForWorkspaceOwner: mocks.runtimeTargetForWorkspaceOwner
}))

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))

vi.mock('@/runtime/runtime-file-search-client', () => ({
  searchRuntimeFiles: mocks.searchRuntimeFiles
}))

const RESULTS: Record<string, SearchResult> = {
  '/projects/zeta': {
    files: [
      {
        filePath: '/projects/zeta/src/z.ts',
        relativePath: 'src/z.ts',
        matches: [{ line: 2, column: 1, matchLength: 3, lineContent: 'foo' }]
      }
    ],
    totalMatches: 1,
    truncated: false
  },
  '/projects/alpha': {
    files: [
      {
        filePath: '/projects/alpha/src/a.ts',
        relativePath: 'src/a.ts',
        matches: [{ line: 4, column: 1, matchLength: 3, lineContent: 'foo' }]
      }
    ],
    totalMatches: 1,
    truncated: false
  }
}

const ROOTS = [
  {
    id: 'repo:zeta',
    worktreeId: 'repo-zeta::/projects/zeta',
    repoId: 'repo-zeta',
    path: '/projects/zeta',
    repoName: 'Zeta',
    worktreeName: 'main',
    executionHostId: 'local' as const
  },
  {
    id: 'repo:alpha',
    worktreeId: 'repo-alpha::/projects/alpha',
    repoId: 'repo-alpha',
    path: '/projects/alpha',
    repoName: 'Alpha',
    worktreeName: 'main',
    executionHostId: 'local' as const
  }
]

describe('useGlobalFileSearchRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.getRuntimeFileSearchRejectedField.mockReturnValue(null)
    mocks.runtimeTargetForWorkspaceOwner.mockReturnValue({ kind: 'local' })
    mocks.searchRuntimeFiles.mockImplementation((_context, options) =>
      Promise.resolve(RESULTS[options.rootPath])
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('searches roots with bounded fan-out and preserves each result owner', async () => {
    const updates: Partial<GlobalFileSearchState>[] = []
    const { result } = renderHook(() =>
      useGlobalFileSearchRunner({
        roots: ROOTS,
        updateSearchState: (update) => updates.push(update)
      })
    )

    await act(async () => {
      result.current.executeSearch('foo', {
        caseSensitive: false,
        wholeWord: false,
        useRegex: false,
        includePattern: undefined,
        excludePattern: undefined
      })
      await vi.advanceTimersByTimeAsync(300)
    })

    const committed = updates.find((update) => update.results !== undefined)
    expect(mocks.searchRuntimeFiles).toHaveBeenCalledTimes(2)
    expect(
      committed?.results && 'groups' in committed.results
        ? committed.results.groups.map((group) => group.detail)
        : []
    ).toEqual(['Alpha', 'Zeta'])
    expect(
      committed?.results && 'groups' in committed.results
        ? committed.results.groups.map((group) => group.owner.worktreeId)
        : []
    ).toEqual(['repo-alpha::/projects/alpha', 'repo-zeta::/projects/zeta'])
  })

  it('searches the roots of the latest render when the scope changed after the search started', async () => {
    const NO_ROOTS: typeof ROOTS = []
    const updates: Partial<GlobalFileSearchState>[] = []
    // Stable like the panel's: a new identity per render re-runs the runner's cancel-on-change effect.
    const updateSearchState = (update: Partial<GlobalFileSearchState>): void => {
      updates.push(update)
    }
    // The current scope hands this runner no roots; a scope switch starts the search from that render.
    const hook = renderHook(
      (props: { roots: typeof ROOTS }) =>
        useGlobalFileSearchRunner({
          roots: props.roots,
          updateSearchState
        }),
      { initialProps: { roots: NO_ROOTS } }
    )
    const executeFromPreviousScope = hook.result.current.executeSearch

    await act(async () => {
      executeFromPreviousScope('foo', {
        caseSensitive: false,
        wholeWord: false,
        useRegex: false,
        includePattern: undefined,
        excludePattern: undefined
      })
    })
    // Render the new scope before the debounce fires, as React does after the click.
    act(() => hook.rerender({ roots: ROOTS }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(mocks.searchRuntimeFiles.mock.calls.map(([, options]) => options.rootPath)).toEqual([
      '/projects/zeta',
      '/projects/alpha'
    ])
  })
})
