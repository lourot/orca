import { useCallback, useEffect, useRef } from 'react'
import { createFileSearchResultOwner } from '@/lib/file-search-result-owner'
import { runtimeTargetForWorkspaceOwner } from '@/lib/resolve-owner'
import { getRuntimeFileSearchRejectedField } from '@/runtime/runtime-file-search-bounds'
import { searchRuntimeFiles } from '@/runtime/runtime-file-search-client'
import { useAppStore } from '@/store'
import type { SearchOptions, SearchResult } from '../../../../shared/code-search-types'
import type { FileSearchResultGroup, FileSearchRoot } from './file-search-scope'

export const GLOBAL_FILE_SEARCH_MAX_RESULTS = 2000
export const GLOBAL_FILE_SEARCH_CONCURRENCY = 4

export type GlobalFileSearchResult = {
  groups: FileSearchResultGroup[]
  totalMatches: number
  totalFiles: number
  truncated: boolean
  unavailableRootCount: number
}

export type GlobalFileSearchState = {
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  useRegex: boolean
  includePattern: string
  excludePattern: string
  results: GlobalFileSearchResult | null
  /** Files under a watched root changed, or Search was hidden, since `results` were committed. */
  resultsStale: boolean
  loading: boolean
  collapsedFiles: Set<string>
}

export function defaultGlobalFileSearchState(): GlobalFileSearchState {
  return {
    query: '',
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
    includePattern: '',
    excludePattern: '',
    results: null,
    resultsStale: false,
    loading: false,
    collapsedFiles: new Set()
  }
}

type GlobalSearchOptions = Pick<
  SearchOptions,
  'caseSensitive' | 'wholeWord' | 'useRegex' | 'includePattern' | 'excludePattern'
>

type UpdateGlobalSearchState = (updates: Partial<GlobalFileSearchState>) => void

type UseGlobalFileSearchRunnerArgs = {
  roots: readonly FileSearchRoot[]
  updateSearchState: UpdateGlobalSearchState
}

function emptyResult(): GlobalFileSearchResult {
  return {
    groups: [],
    totalMatches: 0,
    totalFiles: 0,
    truncated: false,
    unavailableRootCount: 0
  }
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0
  const runWorker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const item = items[nextIndex]
      nextIndex += 1
      if (item !== undefined) {
        await worker(item)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()))
}

export function useGlobalFileSearchRunner({
  roots,
  updateSearchState
}: UseGlobalFileSearchRunnerArgs): {
  executeSearch: (query: string, options: GlobalSearchOptions) => void
  cancelPendingSearch: () => void
} {
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchControllerRef = useRef<AbortController | null>(null)
  const latestSearchIdRef = useRef(0)
  // Why: a scope switch calls executeSearch from the render before the new roots exist; read them when the search fires.
  const rootsRef = useRef(roots)
  rootsRef.current = roots

  const abortInFlightSearch = useCallback(() => {
    searchControllerRef.current?.abort()
    searchControllerRef.current = null
  }, [])

  const cancelPendingSearch = useCallback(() => {
    latestSearchIdRef.current += 1
    abortInFlightSearch()
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
      searchTimerRef.current = null
    }
    updateSearchState({ loading: false })
  }, [abortInFlightSearch, updateSearchState])

  const executeSearch = useCallback(
    (query: string, options: GlobalSearchOptions) => {
      latestSearchIdRef.current += 1
      const searchId = latestSearchIdRef.current
      abortInFlightSearch()

      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current)
        searchTimerRef.current = null
      }

      if (getRuntimeFileSearchRejectedField({ query, ...options })) {
        updateSearchState({ results: emptyResult(), resultsStale: false, loading: false })
        return
      }

      if (!query.trim()) {
        updateSearchState({ results: null, loading: false })
        return
      }

      updateSearchState({ loading: true })
      searchTimerRef.current = setTimeout(async () => {
        searchTimerRef.current = null
        const controller = new AbortController()
        searchControllerRef.current = controller
        const roots = rootsRef.current
        const perRootMaxResults = Math.max(
          1,
          Math.floor(GLOBAL_FILE_SEARCH_MAX_RESULTS / Math.max(1, roots.length))
        )
        const groups: FileSearchResultGroup[] = []
        let unavailableRootCount = 0

        await runWithConcurrency(roots, GLOBAL_FILE_SEARCH_CONCURRENCY, async (root) => {
          const target = runtimeTargetForWorkspaceOwner(useAppStore.getState(), {
            workspaceId: root.worktreeId,
            hostId: root.executionHostId
          })
          // An owner the rows cannot place is not searched; guessing would read the wrong host.
          if (!target) {
            unavailableRootCount += 1
            return
          }
          const owner = createFileSearchResultOwner(
            root.worktreeId,
            target.kind === 'environment' ? target.environmentId : null,
            { rootPath: root.path, executionHostId: root.executionHostId }
          )
          try {
            const result = await searchRuntimeFiles(
              {
                target,
                worktreeId: root.worktreeId,
                worktreePath: root.path,
                connectionId: undefined
              },
              {
                query: query.trim(),
                rootPath: root.path,
                ...options,
                maxResults: perRootMaxResults
              },
              controller.signal
            )
            if (result.files.length > 0) {
              groups.push({
                id: root.id,
                label: root.worktreeName,
                detail: root.repoName,
                owner,
                result
              })
            }
          } catch {
            unavailableRootCount += 1
          }
        })

        if (searchControllerRef.current === controller) {
          searchControllerRef.current = null
        }
        if (latestSearchIdRef.current !== searchId || controller.signal.aborted) {
          return
        }

        groups.sort(
          (left, right) =>
            left.detail.localeCompare(right.detail) || left.label.localeCompare(right.label)
        )
        const result: GlobalFileSearchResult = {
          groups,
          totalMatches: groups.reduce((total, group) => total + group.result.totalMatches, 0),
          totalFiles: groups.reduce((total, group) => total + group.result.files.length, 0),
          truncated: groups.some((group) => group.result.truncated),
          unavailableRootCount
        }
        updateSearchState({ results: result, resultsStale: false, loading: false })
      }, 300)
    },
    [abortInFlightSearch, updateSearchState]
  )

  useEffect(() => cancelPendingSearch, [cancelPendingSearch])

  return { executeSearch, cancelPendingSearch }
}

export function summarizeGlobalFileSearchResult(result: GlobalFileSearchResult): SearchResult {
  return {
    files: result.groups.flatMap((group) => group.result.files),
    totalMatches: result.totalMatches,
    truncated: result.truncated
  }
}
