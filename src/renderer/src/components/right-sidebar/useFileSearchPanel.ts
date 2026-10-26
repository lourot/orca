import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { useActiveWorktree } from '@/store/selectors'
import { buildGroupedSearchRows, buildSearchRows } from './search-rows'
import { cancelRevealFrame } from './search-match-open'
import { useFileSearchRunner } from './useFileSearchRunner'
import { useFileSearchScope } from './useFileSearchScope'
import {
  defaultGlobalFileSearchState,
  summarizeGlobalFileSearchResult,
  useGlobalFileSearchRunner,
  type GlobalFileSearchState
} from './useGlobalFileSearchRunner'
import { getFileSearchRoots, type FileSearchScope } from './file-search-scope'
import { useFileSearchPanelActions } from './use-file-search-panel-actions'
import { useFileSearchStaleWatch } from './use-file-search-stale-watch'
import type { FileSearchPanelActionsArgs } from './file-search-panel-types'
import { selectWorktreesByRepo } from '@/store/workspace-record-selectors'

const EMPTY_COLLAPSED_FILES = new Set<string>()

type PanelActions = ReturnType<typeof useFileSearchPanelActions>

export type FileSearchPanelModel = Omit<PanelActions, 'resultsProps'> & {
  resultsProps: PanelActions['resultsProps'] & ReturnType<typeof useFileSearchStaleWatch>
  activeWorktreeId: string | null
  canSearch: boolean
}

export function useFileSearchPanel(explorerView: 'files' | 'search'): FileSearchPanelModel {
  const activeWorktree = useActiveWorktree()
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const repos = useAppStore((s) => s.repos)
  const worktreesByRepo = useAppStore((s) => selectWorktreesByRepo(s))
  const openFile = useAppStore((s) => s.openFile)
  const setPendingEditorReveal = useAppStore((s) => s.setPendingEditorReveal)
  const updateFileSearchState = useAppStore((s) => s.updateFileSearchState)
  const consumeFileSearchSeedRequest = useAppStore((s) => s.consumeFileSearchSeedRequest)
  const toggleFileSearchCollapsedFile = useAppStore((s) => s.toggleFileSearchCollapsedFile)
  const clearFileSearch = useAppStore((s) => s.clearFileSearch)
  const searchState = useAppStore((s) =>
    activeWorktreeId ? s.fileSearchStateByWorktree[activeWorktreeId] : null
  )
  const [scope, setScope] = useState<FileSearchScope>('current')
  const [globalSearchState, setGlobalSearchState] = useState<GlobalFileSearchState>(
    defaultGlobalFileSearchState
  )

  const worktreePath = activeWorktree?.path ?? null
  const roots = useMemo(
    () => getFileSearchRoots(scope, activeWorktreeId, { repos, worktreesByRepo }),
    [activeWorktreeId, repos, scope, worktreesByRepo]
  )
  const updateActiveSearchState = useCallback<
    FileSearchPanelActionsArgs['updateActiveSearchState']
  >(
    (updates) => {
      if (activeWorktreeId) {
        updateFileSearchState(activeWorktreeId, updates)
      }
    },
    [activeWorktreeId, updateFileSearchState]
  )
  const updateGlobalSearchState = useCallback((updates: Partial<GlobalFileSearchState>): void => {
    setGlobalSearchState((current) => ({ ...current, ...updates }))
  }, [])
  const { executeSearch: executeCurrentSearch, cancelPendingSearch: cancelCurrentSearch } =
    useFileSearchRunner({
      activeWorktreeId,
      worktreePath,
      updateActiveSearchState
    })
  const { executeSearch: executeGlobalSearch, cancelPendingSearch: cancelGlobalSearch } =
    useGlobalFileSearchRunner({
      roots: scope === 'current' ? [] : roots,
      updateSearchState: updateGlobalSearchState
    })

  const isGlobalScope = scope !== 'current'
  const currentSearchQuery = searchState?.query ?? ''
  const currentSearchOptions = {
    caseSensitive: searchState?.caseSensitive ?? false,
    wholeWord: searchState?.wholeWord ?? false,
    useRegex: searchState?.useRegex ?? false,
    includePattern: searchState?.includePattern ?? '',
    excludePattern: searchState?.excludePattern ?? ''
  }
  const isCurrentOwner = useFileSearchScope({
    activeWorktreeId,
    worktreePath,
    // Why: the current-worktree runner has nothing to show while a wider scope is active.
    explorerView: scope === 'current' ? explorerView : 'files',
    executeSearch: executeCurrentSearch,
    cancelPendingSearch: cancelCurrentSearch,
    updateActiveSearchState
  })
  const currentResultsAreCurrent = isCurrentOwner(searchState?.resultOwner)
  const currentSearchResults = currentResultsAreCurrent ? (searchState?.results ?? null) : null
  const currentSearchResultOwner = currentResultsAreCurrent
    ? (searchState?.resultOwner ?? null)
    : null
  const currentSearchError = currentResultsAreCurrent ? (searchState?.error ?? null) : null
  const currentSearchLoading = searchState?.loading ?? false
  const currentSearchCollapsedFiles = searchState?.collapsedFiles ?? EMPTY_COLLAPSED_FILES
  const currentSearchSeedRequestId = searchState?.seedRequestId
  const currentSearchFocusRequestId = searchState?.focusRequestId
  const globalSearchResults = useDeferredValue(globalSearchState.results)
  const committedCurrentSearch = useMemo(
    () => ({ results: currentSearchResults, owner: currentSearchResultOwner }),
    [currentSearchResultOwner, currentSearchResults]
  )
  const deferredCurrentSearch = useDeferredValue(committedCurrentSearch)
  const deferredCurrentResultsAreCurrent = isCurrentOwner(deferredCurrentSearch.owner)
  const deferredCurrentSearchResults = deferredCurrentResultsAreCurrent
    ? deferredCurrentSearch.results
    : null
  const fileSearchQuery = isGlobalScope ? globalSearchState.query : currentSearchQuery
  const fileSearchOptions = isGlobalScope
    ? {
        caseSensitive: globalSearchState.caseSensitive,
        wholeWord: globalSearchState.wholeWord,
        useRegex: globalSearchState.useRegex,
        includePattern: globalSearchState.includePattern,
        excludePattern: globalSearchState.excludePattern
      }
    : currentSearchOptions
  const fileSearchResults = isGlobalScope
    ? globalSearchResults
      ? summarizeGlobalFileSearchResult(globalSearchResults)
      : null
    : deferredCurrentSearchResults
  const fileSearchLoading = isGlobalScope ? globalSearchState.loading : currentSearchLoading
  const fileSearchCollapsedFiles = isGlobalScope
    ? globalSearchState.collapsedFiles
    : currentSearchCollapsedFiles
  const searchRows = useMemo(
    () =>
      isGlobalScope
        ? buildGroupedSearchRows(globalSearchResults?.groups ?? [], fileSearchCollapsedFiles)
        : buildSearchRows(deferredCurrentSearchResults, fileSearchCollapsedFiles),
    [deferredCurrentSearchResults, fileSearchCollapsedFiles, globalSearchResults, isGlobalScope]
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsScrollRef = useRef<HTMLDivElement>(null)
  const revealRafRef = useRef<number | null>(null)
  const revealInnerRafRef = useRef<number | null>(null)
  const seededInputSelectionRafRef = useRef<number | null>(null)
  const includeInputRef = useRef<HTMLInputElement>(null)
  const excludeInputRef = useRef<HTMLInputElement>(null)

  const cancelSeededInputSelectionFrame = (): void => {
    if (seededInputSelectionRafRef.current !== null) {
      cancelAnimationFrame(seededInputSelectionRafRef.current)
      seededInputSelectionRafRef.current = null
    }
  }
  const scheduleSeededInputSelection = (): void => {
    cancelSeededInputSelectionFrame()
    seededInputSelectionRafRef.current = requestAnimationFrame(() => {
      seededInputSelectionRafRef.current = null
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  useEffect(() => {
    return () => {
      cancelSeededInputSelectionFrame()
      cancelRevealFrame(revealRafRef)
      cancelRevealFrame(revealInnerRafRef)
    }
  }, [])

  useEffect(() => {
    if (scope === 'current' && !worktreePath) {
      cancelCurrentSearch()
      updateActiveSearchState({ results: null, resultOwner: null, error: null })
    }
  }, [cancelCurrentSearch, scope, updateActiveSearchState, worktreePath])

  useEffect(() => {
    if (scope !== 'current' || !activeWorktreeId || currentSearchSeedRequestId === undefined) {
      return
    }
    if (currentSearchQuery.trim()) {
      executeCurrentSearch(currentSearchQuery)
    }
    scheduleSeededInputSelection()
    consumeFileSearchSeedRequest(activeWorktreeId, currentSearchSeedRequestId)
  }, [
    activeWorktreeId,
    consumeFileSearchSeedRequest,
    currentSearchQuery,
    currentSearchSeedRequestId,
    executeCurrentSearch,
    scope
  ])

  useEffect(() => {
    if (scope !== 'current' || !activeWorktreeId || currentSearchFocusRequestId === undefined) {
      return
    }
    inputRef.current?.focus()
  }, [activeWorktreeId, currentSearchFocusRequestId, scope])

  const actions = useFileSearchPanelActions({
    activeWorktreeId,
    scope,
    setScope,
    currentSearchQuery,
    currentSearchOptions,
    currentSearchResultOwner: deferredCurrentResultsAreCurrent ? deferredCurrentSearch.owner : null,
    currentSearchError,
    globalSearchState,
    setGlobalSearchState,
    isGlobalScope,
    fileSearchQuery,
    fileSearchOptions,
    fileSearchCaseSensitive: fileSearchOptions.caseSensitive,
    fileSearchWholeWord: fileSearchOptions.wholeWord,
    fileSearchUseRegex: fileSearchOptions.useRegex,
    fileSearchIncludePattern: fileSearchOptions.includePattern,
    fileSearchExcludePattern: fileSearchOptions.excludePattern,
    fileSearchResults,
    globalSearchResults,
    fileSearchLoading,
    searchRows,
    executeCurrentSearch,
    cancelCurrentSearch,
    executeGlobalSearch,
    cancelGlobalSearch,
    updateActiveSearchState,
    clearFileSearch,
    toggleFileSearchCollapsedFile,
    updateGlobalSearchState,
    openFile,
    setPendingEditorReveal,
    revealRafRef,
    revealInnerRafRef,
    resultsScrollRef,
    inputRef,
    includeInputRef,
    excludeInputRef
  })

  const staleWatch = useFileSearchStaleWatch({
    scope,
    explorerView,
    activeWorktreeId,
    worktreePath,
    roots,
    hasCurrentResults: currentSearchResults !== null,
    currentResultOwner: currentSearchResultOwner,
    currentResultsStale: searchState?.resultsStale ?? false,
    globalResults: globalSearchState.results,
    globalResultsStale: globalSearchState.resultsStale,
    loading: fileSearchLoading,
    updateCurrentSearchState: updateActiveSearchState,
    updateGlobalSearchState,
    query: fileSearchQuery,
    options: fileSearchOptions,
    executeCurrentSearch,
    executeGlobalSearch
  })

  return {
    ...actions,
    resultsProps: { ...actions.resultsProps, ...staleWatch },
    activeWorktreeId,
    canSearch: scope === 'current' ? Boolean(activeWorktreeId && worktreePath) : roots.length > 0
  }
}
