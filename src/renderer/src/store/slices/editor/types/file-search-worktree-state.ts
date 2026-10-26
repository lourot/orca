import type { SearchResult } from '../../../../../../shared/code-search-types'
import type { FileSearchResultOwner } from '@/lib/file-search-result-owner'

export type FileSearchWorktreeState = {
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  useRegex: boolean
  includePattern: string
  excludePattern: string
  results: SearchResult | null
  resultOwner: FileSearchResultOwner | null
  /** Files under the searched root changed, or Search was hidden, since `results` were committed. */
  resultsStale?: boolean
  error?: string | null
  loading: boolean
  collapsedFiles: Set<string>
  seedRequestId?: number
  focusRequestId?: number
}
