import type React from 'react'
import type { SearchResult } from '../../../../shared/code-search-types'
import type { FileSearchResultOwner } from '@/lib/file-search-result-owner'
import type { FileSearchWorktreeState } from '@/store/slices/editor/types/file-search-worktree-state'
import type { SearchRow } from './search-rows'
import type { FileSearchScope } from './file-search-scope'
import type { GlobalFileSearchResult, GlobalFileSearchState } from './useGlobalFileSearchRunner'
import type { openMatchResult } from './search-match-open'

export type SearchOptionsState = Pick<
  GlobalFileSearchState,
  'caseSensitive' | 'wholeWord' | 'useRegex' | 'includePattern' | 'excludePattern'
>

export type FileSearchPanelActionsArgs = {
  activeWorktreeId: string | null
  scope: FileSearchScope
  setScope: (scope: FileSearchScope) => void
  currentSearchQuery: string
  currentSearchOptions: SearchOptionsState
  currentSearchResultOwner: FileSearchResultOwner | null
  globalSearchState: GlobalFileSearchState
  setGlobalSearchState: React.Dispatch<React.SetStateAction<GlobalFileSearchState>>
  isGlobalScope: boolean
  fileSearchQuery: string
  fileSearchOptions: SearchOptionsState
  fileSearchCaseSensitive: boolean
  fileSearchWholeWord: boolean
  fileSearchUseRegex: boolean
  fileSearchIncludePattern: string
  fileSearchExcludePattern: string
  fileSearchResults: SearchResult | null
  globalSearchResults: GlobalFileSearchResult | null
  fileSearchLoading: boolean
  searchRows: SearchRow[]
  executeCurrentSearch: (query: string) => void
  cancelCurrentSearch: () => void
  executeGlobalSearch: (query: string, options: SearchOptionsState) => void
  cancelGlobalSearch: () => void
  updateActiveSearchState: (updates: Partial<FileSearchWorktreeState>) => void
  clearFileSearch: (worktreeId: string) => void
  toggleFileSearchCollapsedFile: (worktreeId: string, collapseKey: string) => void
  updateGlobalSearchState: (updates: Partial<GlobalFileSearchState>) => void
  openFile: Parameters<typeof openMatchResult>[0]['openFile']
  setActiveWorktree: (worktreeId: string) => void
  setPendingEditorReveal: Parameters<typeof openMatchResult>[0]['setPendingEditorReveal']
  revealRafRef: React.RefObject<number | null>
  revealInnerRafRef: React.RefObject<number | null>
  resultsScrollRef: React.RefObject<HTMLDivElement | null>
  inputRef: React.RefObject<HTMLInputElement | null>
  includeInputRef: React.RefObject<HTMLInputElement | null>
  excludeInputRef: React.RefObject<HTMLInputElement | null>
}
