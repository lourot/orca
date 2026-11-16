import { normalizeExecutionHostId } from '../../../shared/execution-host'
import { useAppStore } from '@/store'
import type { FileSearchResultOwner } from './file-search-result-owner'
import { activateAndRevealWorkspace } from './worktree-activation'

/** Select the workspace that produced a file-search result and flash its sidebar row. */
export function activateFileSearchResultOwner(owner: FileSearchResultOwner): boolean {
  const executionHostId = normalizeExecutionHostId(owner.executionHostId)
  const host = executionHostId ? { executionHostId } : {}
  const activated = activateAndRevealWorkspace(owner.worktreeId, {
    providesInitialSurface: true,
    revealInSidebar: false,
    ...host
  })
  if (activated === false) {
    return false
  }
  // Why reveal here: the activation helpers take no highlight option, so the row flash rides on this reveal.
  useAppStore
    .getState()
    .revealWorktreeInSidebar(owner.worktreeId, { behavior: 'auto', highlight: true, ...host })
  return true
}
