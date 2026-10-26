import type {
  SearchFileResult,
  SearchMatch,
  SearchResult
} from '../../../../shared/code-search-types'
import type { FileSearchResultOwner } from '@/lib/file-search-result-owner'
import type { FileSearchResultGroup } from './file-search-scope'

export type SearchRow =
  | {
      type: 'scope'
      id: string
      label: string
      detail: string
    }
  | {
      type: 'file'
      fileResult: SearchFileResult
      collapsed: boolean
      collapseKey: string
      owner?: FileSearchResultOwner
    }
  | {
      type: 'match'
      fileResult: SearchFileResult
      match: SearchMatch
      matchIndex: number
      owner?: FileSearchResultOwner
    }

type SearchRowOptions = {
  collapseKeyPrefix?: string
  owner?: FileSearchResultOwner
}

export function buildSearchRows(
  results: SearchResult | null,
  collapsedFiles: ReadonlySet<string>,
  options: SearchRowOptions = {}
): SearchRow[] {
  if (!results) {
    return []
  }

  // Keep the summary outside virtualization as a fixed header while results scroll.
  const rows: SearchRow[] = []

  for (const fileResult of results.files) {
    const collapseKey = options.collapseKeyPrefix
      ? `${options.collapseKeyPrefix}:${fileResult.filePath}`
      : fileResult.filePath
    const collapsed = collapsedFiles.has(collapseKey)
    rows.push({
      type: 'file',
      fileResult,
      collapsed,
      collapseKey,
      ...(options.owner ? { owner: options.owner } : {})
    })

    // Flatten for virtualization; mounting every ripgrep match at once froze the renderer.
    if (collapsed) {
      continue
    }

    for (const [matchIndex, match] of fileResult.matches.entries()) {
      rows.push({
        type: 'match',
        fileResult,
        match,
        matchIndex,
        ...(options.owner ? { owner: options.owner } : {})
      })
    }
  }

  return rows
}

export function buildGroupedSearchRows(
  groups: readonly FileSearchResultGroup[],
  collapsedFiles: ReadonlySet<string>
): SearchRow[] {
  const rows: SearchRow[] = []
  for (const group of groups) {
    rows.push({ type: 'scope', id: group.id, label: group.label, detail: group.detail })
    rows.push(
      ...buildSearchRows(group.result, collapsedFiles, {
        collapseKeyPrefix: group.id,
        owner: group.owner
      })
    )
  }
  return rows
}
