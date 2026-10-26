import type React from 'react'
import { useCallback } from 'react'
import type {
  SearchFileResult,
  SearchMatch,
  SearchResult
} from '../../../../shared/code-search-types'
import type { FileSearchResultOwner } from '@/lib/file-search-result-owner'
import type { SearchFiltersProps } from './SearchFilters'
import type { SearchQueryRowProps } from './SearchQueryRow'
import type { SearchRow } from './search-rows'
import type { FileSearchScope } from './file-search-scope'
import { openMatchResult } from './search-match-open'
import type { FileSearchPanelActionsArgs, SearchOptionsState } from './file-search-panel-types'

export function useFileSearchPanelActions(args: FileSearchPanelActionsArgs): {
  scopeProps: { value: FileSearchScope; onChange: (scope: FileSearchScope) => void }
  queryRowProps: SearchQueryRowProps
  filtersProps: SearchFiltersProps
  resultsProps: {
    results: SearchResult | null
    hasCommittedResults: boolean
    query: string
    loading: boolean
    rows: SearchRow[]
    unavailableRootCount: number
    scrollRef: React.RefObject<HTMLDivElement | null>
    onToggleCollapsedFile: (collapseKey: string) => void
    onMatchClick: (
      fileResult: SearchFileResult,
      match: SearchMatch,
      owner?: FileSearchResultOwner
    ) => void
  }
  focusQueryInput: () => void
} {
  const {
    activeWorktreeId,
    scope,
    setScope,
    currentSearchQuery,
    currentSearchOptions,
    currentSearchResultOwner,
    globalSearchState,
    setGlobalSearchState,
    isGlobalScope,
    fileSearchQuery,
    fileSearchOptions,
    fileSearchCaseSensitive,
    fileSearchWholeWord,
    fileSearchUseRegex,
    fileSearchIncludePattern,
    fileSearchExcludePattern,
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
    setActiveWorktree,
    setPendingEditorReveal,
    revealRafRef,
    revealInnerRafRef,
    resultsScrollRef,
    inputRef,
    includeInputRef,
    excludeInputRef
  } = args

  const focusQueryInput = useCallback(() => {
    inputRef.current?.focus()
  }, [inputRef])

  const cancelPendingSearch = useCallback(() => {
    cancelCurrentSearch()
    cancelGlobalSearch()
  }, [cancelCurrentSearch, cancelGlobalSearch])

  const handleClearSearch = useCallback(() => {
    cancelPendingSearch()
    if (scope === 'current') {
      if (activeWorktreeId) {
        clearFileSearch(activeWorktreeId)
      }
      return
    }
    setGlobalSearchState((current) => ({
      ...current,
      query: '',
      results: null,
      loading: false,
      collapsedFiles: new Set()
    }))
  }, [activeWorktreeId, cancelPendingSearch, clearFileSearch, scope, setGlobalSearchState])

  const handleScopeChange = useCallback(
    (nextScope: FileSearchScope) => {
      if (nextScope === scope) {
        return
      }
      cancelPendingSearch()
      const queryToSearch =
        nextScope === 'current'
          ? currentSearchQuery
          : scope === 'current'
            ? currentSearchQuery
            : globalSearchState.query
      const optionsToSearch = nextScope === 'current' ? currentSearchOptions : fileSearchOptions
      setScope(nextScope)
      if (nextScope === 'current') {
        executeCurrentSearch(queryToSearch)
      } else {
        setGlobalSearchState((current) => ({
          ...current,
          query: queryToSearch,
          ...optionsToSearch
        }))
        executeGlobalSearch(queryToSearch, optionsToSearch)
      }
    },
    [
      cancelPendingSearch,
      currentSearchOptions,
      currentSearchQuery,
      executeCurrentSearch,
      executeGlobalSearch,
      fileSearchOptions,
      globalSearchState.query,
      scope,
      setGlobalSearchState,
      setScope
    ]
  )

  const handleQueryChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const query = event.target.value
      if (scope === 'current') {
        updateActiveSearchState({ query })
        executeCurrentSearch(query)
      } else {
        updateGlobalSearchState({ query })
        executeGlobalSearch(query, fileSearchOptions)
      }
    },
    [
      executeCurrentSearch,
      executeGlobalSearch,
      fileSearchOptions,
      scope,
      updateActiveSearchState,
      updateGlobalSearchState
    ]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.nativeEvent.isComposing) {
        return
      }
      if (event.key === 'Escape' && fileSearchQuery) {
        handleClearSearch()
      }
      if (event.key === 'Enter') {
        if (scope === 'current') {
          executeCurrentSearch(fileSearchQuery)
        } else {
          executeGlobalSearch(fileSearchQuery, fileSearchOptions)
        }
      }
    },
    [
      executeCurrentSearch,
      executeGlobalSearch,
      fileSearchOptions,
      fileSearchQuery,
      handleClearSearch,
      scope
    ]
  )

  const updateOptionAndSearch = useCallback(
    (updates: Partial<SearchOptionsState>) => {
      const nextOptions = { ...fileSearchOptions, ...updates }
      if (scope === 'current') {
        updateActiveSearchState(updates)
        executeCurrentSearch(fileSearchQuery)
      } else {
        updateGlobalSearchState(updates)
        executeGlobalSearch(fileSearchQuery, nextOptions)
      }
    },
    [
      executeCurrentSearch,
      executeGlobalSearch,
      fileSearchOptions,
      fileSearchQuery,
      scope,
      updateActiveSearchState,
      updateGlobalSearchState
    ]
  )

  const toggleActiveCollapsedFile = useCallback(
    (collapseKey: string) => {
      if (scope === 'current') {
        if (activeWorktreeId) {
          toggleFileSearchCollapsedFile(activeWorktreeId, collapseKey)
        }
        return
      }
      setGlobalSearchState((current) => {
        const nextCollapsed = new Set(current.collapsedFiles)
        if (nextCollapsed.has(collapseKey)) {
          nextCollapsed.delete(collapseKey)
        } else {
          nextCollapsed.add(collapseKey)
        }
        return { ...current, collapsedFiles: nextCollapsed }
      })
    },
    [activeWorktreeId, scope, setGlobalSearchState, toggleFileSearchCollapsedFile]
  )

  const handleMatchClick = useCallback(
    (fileResult: SearchFileResult, match: SearchMatch, owner?: FileSearchResultOwner) => {
      const resultOwner = owner ?? currentSearchResultOwner
      if (resultOwner && resultOwner.worktreeId !== activeWorktreeId) {
        setActiveWorktree(resultOwner.worktreeId)
      }
      openMatchResult({
        resultOwner,
        fileResult,
        match,
        openFile,
        setPendingEditorReveal,
        revealRafRef,
        revealInnerRafRef
      })
    },
    [
      activeWorktreeId,
      currentSearchResultOwner,
      openFile,
      revealInnerRafRef,
      revealRafRef,
      setActiveWorktree,
      setPendingEditorReveal
    ]
  )

  return {
    scopeProps: { value: scope, onChange: handleScopeChange },
    queryRowProps: {
      inputRef,
      query: fileSearchQuery,
      loading: fileSearchLoading,
      caseSensitive: fileSearchCaseSensitive,
      wholeWord: fileSearchWholeWord,
      useRegex: fileSearchUseRegex,
      onQueryChange: handleQueryChange,
      onKeyDown: handleKeyDown,
      onClearSearch: handleClearSearch,
      onToggleCaseSensitive: () =>
        updateOptionAndSearch({ caseSensitive: !fileSearchCaseSensitive }),
      onToggleWholeWord: () => updateOptionAndSearch({ wholeWord: !fileSearchWholeWord }),
      onToggleRegex: () => updateOptionAndSearch({ useRegex: !fileSearchUseRegex })
    },
    filtersProps: {
      includePattern: fileSearchIncludePattern,
      excludePattern: fileSearchExcludePattern,
      includeInputRef,
      excludeInputRef,
      onIncludeChange: (value: string) => updateOptionAndSearch({ includePattern: value }),
      onExcludeChange: (value: string) => updateOptionAndSearch({ excludePattern: value })
    },
    resultsProps: {
      results: fileSearchResults,
      hasCommittedResults: fileSearchResults !== null,
      query: fileSearchQuery,
      loading: fileSearchLoading,
      rows: searchRows,
      unavailableRootCount: isGlobalScope ? (globalSearchResults?.unavailableRootCount ?? 0) : 0,
      scrollRef: resultsScrollRef,
      onToggleCollapsedFile: toggleActiveCollapsedFile,
      onMatchClick: handleMatchClick
    },
    focusQueryInput
  }
}
