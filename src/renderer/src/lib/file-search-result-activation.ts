import type { FileSearchResultOwner } from './file-search-result-owner'
import { activateAndRevealWorkspace } from './worktree-activation'

/** Select and reveal the workspace that produced a file-search result. */
export function activateFileSearchResultOwner(owner: FileSearchResultOwner): boolean {
  return (
    activateAndRevealWorkspace(owner.worktreeId, {
      providesInitialSurface: true,
      sidebarRevealBehavior: 'auto',
      highlightInSidebar: true,
      ...(owner.executionHostId ? { executionHostId: owner.executionHostId } : {})
    }) !== false
  )
}
