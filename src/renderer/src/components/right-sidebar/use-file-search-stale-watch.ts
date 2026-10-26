import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import type { FileSearchResultOwner } from '@/lib/file-search-result-owner'
import { isFileChangeUnderRoot } from '@/lib/worktree-file-change-filter'
import { ORCA_WORKTREE_FILE_CHANGE_EVENT } from '@/hooks/worktree-file-change-event'
import {
  selectWatchedFileSearchRoots,
  type FileSearchRoot,
  type FileSearchScope
} from './file-search-scope'
import type { GlobalFileSearchResult } from './useGlobalFileSearchRunner'
import type { SearchOptionsState } from './file-search-panel-types'

type UseFileSearchStaleWatchArgs = {
  scope: FileSearchScope
  explorerView: 'files' | 'search'
  activeWorktreeId: string | null
  worktreePath: string | null
  roots: readonly FileSearchRoot[]
  hasCurrentResults: boolean
  /** Host and root that produced the current-scope results; events are matched against it. */
  currentResultOwner: FileSearchResultOwner | null
  currentResultsStale: boolean
  globalResults: GlobalFileSearchResult | null
  globalResultsStale: boolean
  /** A search for the shown scope is pending or running. */
  loading: boolean
  updateCurrentSearchState: (updates: { resultsStale: boolean }) => void
  updateGlobalSearchState: (updates: { resultsStale: boolean }) => void
  query: string
  options: SearchOptionsState
  executeCurrentSearch: (query: string) => void
  executeGlobalSearch: (query: string, options: SearchOptionsState) => void
}

/** Tracks whether shown search results may no longer match disk, and re-runs the search on demand. */
export function useFileSearchStaleWatch({
  scope,
  explorerView,
  activeWorktreeId,
  worktreePath,
  roots,
  hasCurrentResults,
  currentResultOwner,
  currentResultsStale,
  globalResults,
  globalResultsStale,
  loading,
  updateCurrentSearchState,
  updateGlobalSearchState,
  query,
  options,
  executeCurrentSearch,
  executeGlobalSearch
}: UseFileSearchStaleWatchArgs): {
  stale: boolean
  untrackedRootCount: number
  onRefresh: () => void
} {
  const isGlobalScope = scope !== 'current'
  const isSearchVisible = explorerView === 'search'
  const hasResults = isGlobalScope ? globalResults !== null : hasCurrentResults
  const stale = hasResults && (isGlobalScope ? globalResultsStale : currentResultsStale)
  const markStale = useCallback(
    () =>
      (isGlobalScope ? updateGlobalSearchState : updateCurrentSearchState)({ resultsStale: true }),
    [isGlobalScope, updateCurrentSearchState, updateGlobalSearchState]
  )
  const setFileSearchWatchWorktreeIds = useAppStore((state) => state.setFileSearchWatchWorktreeIds)

  const watchedRoots = useMemo(
    () =>
      // Why: watch from the moment a search starts, so edits made while it runs are seen.
      isGlobalScope && isSearchVisible && (globalResults || loading)
        ? selectWatchedFileSearchRoots(
            roots,
            new Set(globalResults?.groups.map((group) => group.id))
          )
        : [],
    [globalResults, isGlobalScope, isSearchVisible, loading, roots]
  )

  useEffect(() => {
    setFileSearchWatchWorktreeIds(watchedRoots.map((root) => root.worktreeId))
  }, [setFileSearchWatchWorktreeIds, watchedRoots])
  // Separate from the effect above so a changed root list doesn't unwatch everything first.
  useEffect(() => () => setFileSearchWatchWorktreeIds([]), [setFileSearchWatchWorktreeIds])

  const hasResultsRef = useRef(hasResults)
  hasResultsRef.current = hasResults
  const markStaleRef = useRef(markStale)
  markStaleRef.current = markStale
  const staleRef = useRef(stale)
  staleRef.current = stale
  const loadingRef = useRef(loading)
  loadingRef.current = loading
  const changedDuringSearchRef = useRef(false)
  // Multi-workspace results don't depend on the active workspace, so switching it isn't a "return".
  const showKey = isGlobalScope ? null : activeWorktreeId
  // Why: this listener is off while Search is hidden, so kept results can't be trusted on return.
  // Marking on show (not on hide) stays idempotent under StrictMode's double-run effects.
  useEffect(() => {
    if (isSearchVisible && hasResultsRef.current) {
      markStaleRef.current()
    }
  }, [showKey, isSearchVisible])

  // Why: a finished search clears the flag, so a change seen while it ran is applied afterwards.
  useEffect(() => {
    if (loading) {
      changedDuringSearchRef.current = false
    } else if (changedDuringSearchRef.current) {
      changedDuringSearchRef.current = false
      markStaleRef.current()
    }
  }, [loading])

  useEffect(() => {
    if (!isSearchVisible || !(hasResults || loading)) {
      return
    }
    const currentRootPath = currentResultOwner?.rootPath ?? worktreePath
    const rootPaths = isGlobalScope
      ? watchedRoots.map((root) => root.path)
      : currentRootPath
        ? [currentRootPath]
        : []
    // Multi-workspace roots are always local; before a first result there is no owner yet, so local.
    const runtimeEnvironmentId = isGlobalScope
      ? null
      : (currentResultOwner?.runtimeEnvironmentId ?? null)
    const handleChange = (event: WindowEventMap[typeof ORCA_WORKTREE_FILE_CHANGE_EVENT]): void => {
      if ((event.detail.runtimeEnvironmentId ?? null) !== runtimeEnvironmentId) {
        return
      }
      if (!rootPaths.some((rootPath) => isFileChangeUnderRoot(event.detail.payload, rootPath))) {
        return
      }
      if (loadingRef.current) {
        changedDuringSearchRef.current = true
      } else if (!staleRef.current) {
        markStaleRef.current()
      }
    }
    window.addEventListener(ORCA_WORKTREE_FILE_CHANGE_EVENT, handleChange)
    return () => window.removeEventListener(ORCA_WORKTREE_FILE_CHANGE_EVENT, handleChange)
  }, [
    currentResultOwner,
    hasResults,
    isGlobalScope,
    isSearchVisible,
    loading,
    watchedRoots,
    worktreePath
  ])

  const onRefresh = useCallback(() => {
    if (isGlobalScope) {
      executeGlobalSearch(query, options)
    } else {
      executeCurrentSearch(query)
    }
  }, [executeCurrentSearch, executeGlobalSearch, isGlobalScope, options, query])

  return {
    stale,
    untrackedRootCount: isGlobalScope && globalResults ? roots.length - watchedRoots.length : 0,
    onRefresh
  }
}
