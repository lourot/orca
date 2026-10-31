import {
  getRepoExecutionHostId,
  getWorktreeExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import { normalizeRuntimePathForComparison } from '../../../../shared/cross-platform-path'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import { getRepoMainWorktreeId } from '../../../../shared/worktree/id'
import type { Worktree } from '../../../../shared/worktree/types'
import type { Repo } from '../../../../shared/repo-types'
import type { SearchResult } from '../../../../shared/code-search-types'
import type { FileSearchResultOwner } from '@/lib/file-search-result-owner'
import { selectWorktreesByRepo } from '@/store/workspace-record-selectors'

export type FileSearchScope = 'current' | 'all-primary' | 'all-worktrees'

export type FileSearchRoot = {
  id: string
  worktreeId: string
  repoId: string
  path: string
  repoName: string
  worktreeName: string
  executionHostId: ExecutionHostId
}

export type FileSearchResultGroup = {
  id: string
  label: string
  detail: string
  owner: FileSearchResultOwner
  result: SearchResult
}

type FileSearchCatalogState = {
  repos: readonly Repo[]
  worktreesByRepo: Record<string, readonly Worktree[]>
}

function isLocalRepo(repo: Repo): boolean {
  return isGitRepoKind(repo) && getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID
}

function worktreeHostMatchesLocal(worktree: Worktree, repo: Repo): boolean {
  return (worktree.hostId ?? getRepoExecutionHostId(repo)) === LOCAL_EXECUTION_HOST_ID
}

function rootFromRepo(repo: Repo, worktreeName = repo.displayName): FileSearchRoot {
  return {
    id: `repo:${repo.id}`,
    worktreeId: getRepoMainWorktreeId(repo),
    repoId: repo.id,
    path: repo.path,
    repoName: repo.displayName,
    worktreeName,
    executionHostId: getWorktreeExecutionHostId({ hostId: undefined }, repo)
  }
}

function rootFromWorktree(worktree: Worktree, repo: Repo): FileSearchRoot {
  return {
    id: `worktree:${worktree.id}`,
    worktreeId: worktree.id,
    repoId: repo.id,
    path: worktree.path,
    repoName: repo.displayName,
    worktreeName: worktree.displayName || worktree.path,
    executionHostId: getWorktreeExecutionHostId(worktree, repo)
  }
}

function sortRoots(left: FileSearchRoot, right: FileSearchRoot): number {
  return (
    left.repoName.localeCompare(right.repoName) ||
    left.worktreeName.localeCompare(right.worktreeName) ||
    left.path.localeCompare(right.path)
  )
}

function deduplicateRoots(roots: readonly FileSearchRoot[]): FileSearchRoot[] {
  const seenPaths = new Set<string>()
  const result: FileSearchRoot[] = []
  for (const root of roots) {
    const pathKey = normalizeRuntimePathForComparison(root.path)
    if (seenPaths.has(pathKey)) {
      continue
    }
    seenPaths.add(pathKey)
    result.push(root)
  }
  return result.sort(sortRoots)
}

export function getFileSearchRoots(
  scope: FileSearchScope,
  activeWorktreeId: string | null,
  state: FileSearchCatalogState
): FileSearchRoot[] {
  if (scope === 'current') {
    if (!activeWorktreeId) {
      return []
    }
    for (const worktrees of Object.values(selectWorktreesByRepo(state))) {
      const worktree = worktrees.find((candidate) => candidate.id === activeWorktreeId)
      if (!worktree) {
        continue
      }
      const repo = state.repos.find((candidate) => candidate.id === worktree.repoId)
      return repo ? [rootFromWorktree(worktree, repo)] : []
    }
    return []
  }

  const localRepos = state.repos.filter(isLocalRepo)
  if (scope === 'all-primary') {
    return deduplicateRoots(localRepos.map((repo) => rootFromRepo(repo)))
  }

  const roots: FileSearchRoot[] = []
  for (const repo of localRepos) {
    const worktrees = selectWorktreesByRepo(state)[repo.id] ?? []
    const localWorktrees = worktrees.filter((worktree) => worktreeHostMatchesLocal(worktree, repo))
    roots.push(...localWorktrees.map((worktree) => rootFromWorktree(worktree, repo)))
    if (
      !localWorktrees.some(
        (worktree) =>
          normalizeRuntimePathForComparison(worktree.path) ===
          normalizeRuntimePathForComparison(repo.path)
      )
    ) {
      roots.push(rootFromRepo(repo))
    }
  }
  return deduplicateRoots(roots)
}

// Why: each root is a recursive OS watch; Linux inotify spends one watch per subdirectory.
export const FILE_SEARCH_MAX_WATCHED_ROOTS = 32

/** Roots to watch for a multi-workspace result: those with matches first, then the rest, capped. */
export function selectWatchedFileSearchRoots(
  roots: readonly FileSearchRoot[],
  matchedRootIds: ReadonlySet<string>,
  max = FILE_SEARCH_MAX_WATCHED_ROOTS
): FileSearchRoot[] {
  const matched = roots.filter((root) => matchedRootIds.has(root.id))
  const unmatched = roots.filter((root) => !matchedRootIds.has(root.id))
  return [...matched, ...unmatched].slice(0, max)
}
