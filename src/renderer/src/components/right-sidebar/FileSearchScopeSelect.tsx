import type React from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import type { FileSearchScope } from './file-search-scope'

export type FileSearchScopeSelectProps = {
  value: FileSearchScope
  onChange: (scope: FileSearchScope) => void
}

function isFileSearchScope(value: string): value is FileSearchScope {
  return value === 'current' || value === 'all-primary' || value === 'all-worktrees'
}

export function FileSearchScopeSelect({
  value,
  onChange
}: FileSearchScopeSelectProps): React.JSX.Element {
  return (
    <Select value={value} onValueChange={(next) => isFileSearchScope(next) && onChange(next)}>
      <SelectTrigger
        size="sm"
        aria-label={translate('auto.components.right.sidebar.Search.scopeLabel', 'Search scope')}
        className="min-w-0 flex-1"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        <SelectItem value="current">
          {translate('auto.components.right.sidebar.Search.scopeCurrent', 'Current worktree')}
        </SelectItem>
        <SelectItem value="all-primary">
          {translate('auto.components.right.sidebar.Search.scopePrimary', 'All primary checkouts')}
        </SelectItem>
        <SelectItem value="all-worktrees">
          {translate('auto.components.right.sidebar.Search.scopeAll', 'All local worktrees')}
        </SelectItem>
      </SelectContent>
    </Select>
  )
}
