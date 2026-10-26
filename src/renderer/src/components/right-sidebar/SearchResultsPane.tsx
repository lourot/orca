import React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type {
  SearchFileResult,
  SearchMatch,
  SearchResult
} from '../../../../shared/code-search-types'
import type { FileSearchResultOwner } from '@/lib/file-search-result-owner'
import type { SearchRow } from './search-rows'
import { FileResultRow, MatchResultRow } from './SearchResultItems'
import { translate } from '@/i18n/i18n'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

const SEARCH_VIRTUAL_OVERSCAN = 12

type SearchResultsPaneProps = {
  results: SearchResult | null
  error?: string | null
  hasCommittedResults: boolean
  query: string
  loading: boolean
  rows: SearchRow[]
  scrollRef: React.RefObject<HTMLDivElement | null>
  unavailableRootCount?: number
  untrackedRootCount?: number
  stale?: boolean
  onRefresh?: () => void
  onToggleCollapsedFile: (collapseKey: string) => void
  onMatchClick: (
    fileResult: SearchFileResult,
    match: SearchMatch,
    owner?: FileSearchResultOwner
  ) => void
}

function formatSearchResultSummary(matchCount: number, fileCount: number): string {
  const results = translate(
    'auto.components.right.sidebar.Search.resultCount',
    '{{count}} results',
    { count: matchCount, defaultValue_one: '{{count}} result' }
  )
  const files = translate('auto.components.right.sidebar.Search.fileCount', '{{count}} files', {
    count: fileCount,
    defaultValue_one: '{{count}} file'
  })
  return translate(
    'auto.components.right.sidebar.Search.resultsInFiles',
    '{{results}} in {{files}}',
    {
      results,
      files
    }
  )
}

export function SearchResultsPane({
  results,
  hasCommittedResults,
  error,
  query,
  loading,
  rows,
  scrollRef,
  unavailableRootCount = 0,
  untrackedRootCount = 0,
  stale = false,
  onRefresh,
  onToggleCollapsedFile,
  onMatchClick
}: SearchResultsPaneProps): React.JSX.Element {
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index]
      if (!row) {
        return 20
      }
      if (row.type === 'scope') {
        return 28
      }
      // File rows include 6px inter-group spacing and need a taller estimate.
      if (row.type === 'file') {
        return 28
      }
      return 20
    },
    // File rows already supply top spacing; pad only the end of the list.
    paddingEnd: 8,
    overscan: SEARCH_VIRTUAL_OVERSCAN,
    getItemKey: (index) => {
      const row = rows[index]
      if (!row) {
        return `missing:${index}`
      }
      if (row.type === 'scope') {
        return `scope:${row.id}`
      }
      if (row.type === 'file') {
        return `file:${row.collapseKey}`
      }
      return `match:${row.fileResult.filePath}:${row.match.line}:${row.match.column}:${row.matchIndex}`
    }
  })

  return (
    <>
      {!error && results && (rows.length > 0 || results.truncated) && (
        <div className="px-2 py-1 text-2xs text-muted-foreground border-b border-border">
          {formatSearchResultSummary(results.totalMatches, results.files.length)}{' '}
          {results.truncated &&
            translate('auto.components.right.sidebar.Search.dcc294f28d', '(results truncated)')}
          {unavailableRootCount > 0 &&
            ` ${translate('auto.components.right.sidebar.Search.unavailableRoots', '({{value0}} worktrees unavailable)', { value0: unavailableRootCount })}`}
          {untrackedRootCount > 0 &&
            ` ${translate('fileSearch.untrackedRoots', "(changes in {{value0}} workspaces aren't tracked)", { value0: untrackedRootCount })}`}
        </div>
      )}

      {!error && hasCommittedResults && stale && onRefresh && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 border-b border-border px-2 py-0.5 text-[10px] text-muted-foreground"
        >
          <span>{translate('fileSearch.resultsOutdated', 'Results may be outdated')}</span>
          <Button variant="ghost" size="xs" onClick={onRefresh}>
            <RefreshCw />
            {translate('fileSearch.refresh', 'Refresh')}
          </Button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-sleek">
        {error && (
          <div
            role="alert"
            className="p-2 text-xs text-destructive whitespace-pre-wrap break-words"
          >
            {error}
          </div>
        )}
        {!error && rows.length > 0 && (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              if (!row) {
                return null
              }

              return (
                <div
                  key={virtualRow.key}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {row.type === 'scope' && (
                    <div className="flex items-center gap-1 border-t border-border bg-muted/30 px-2 py-1 text-[10px] font-medium text-foreground">
                      <span className="truncate">{row.label}</span>
                      <span className="truncate text-muted-foreground">{row.detail}</span>
                    </div>
                  )}
                  {row.type === 'file' && (
                    <FileResultRow
                      fileResult={row.fileResult}
                      collapsed={row.collapsed}
                      onToggleCollapse={() => onToggleCollapsedFile(row.collapseKey)}
                    />
                  )}
                  {row.type === 'match' && (
                    <MatchResultRow
                      match={row.match}
                      relativePath={row.fileResult.relativePath}
                      onClick={() => onMatchClick(row.fileResult, row.match, row.owner)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {!error && !hasCommittedResults && query && !loading && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
            {translate('auto.components.right.sidebar.Search.d56d140747', 'Press Enter to search')}
          </div>
        )}

        {!error && hasCommittedResults && results?.totalMatches === 0 && !loading && (
          <div className="px-3 py-6 text-xs text-muted-foreground">
            {translate(
              'fileSearch.noResults',
              'No results. Try another search or adjust your filters.'
            )}
          </div>
        )}

        {!error && !query && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
            {translate(
              'auto.components.right.sidebar.Search.1abfb25a66',
              'Type to search in files'
            )}
          </div>
        )}
      </div>
    </>
  )
}
