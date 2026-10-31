import {
  parseExecutionHostId,
  toRuntimeExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host'
import { findRuntimeWorkspaceFileOwner } from '../../../shared/runtime-workspace-file-owner'
import { folderWorkspaceKey } from '../../../shared/workspace-scope'
import type { AppState } from '@/store/types'
import { getIndexedAllWorktrees } from '@/store/worktree-repo-index'
import { getExecutionHostIdForWorktree } from './worktree-runtime-owner'
import { runtimeEnvironmentIdUnlessTwin } from './resolve-owner'
import { resolveExplicitWorktreeOperationRouteResult } from './worktree-operation-catalog-route'
import { selectFolderWorkspaces, selectWorktreesByRepo } from '@/store/workspace-record-selectors'

export type RuntimeWorkspaceFileRoute = {
  worktreeId: string
  relativePath: string
  executionHostId: ExecutionHostId
}

function workspaceMatchesExecutionHost(
  state: AppState,
  workspaceId: string,
  executionHostId: ExecutionHostId
): boolean {
  const parsedHost = parseExecutionHostId(executionHostId)
  if (parsedHost?.kind === 'runtime') {
    // Why: a twin matches neither host, so a server's path never opens as the other twin's file.
    return runtimeEnvironmentIdUnlessTwin(state, workspaceId) === parsedHost.environmentId
  }
  const explicit = resolveExplicitWorktreeOperationRouteResult(state, workspaceId)
  if (explicit.kind === 'resolved') {
    return explicit.route.executionHostId === executionHostId
  }
  return (
    executionHostId === 'local' && getExecutionHostIdForWorktree(state, workspaceId) === 'local'
  )
}

export function findWorkspaceFileRoute(
  state: AppState,
  executionHostId: ExecutionHostId,
  absolutePath: string
): RuntimeWorkspaceFileRoute | null {
  const roots = getIndexedAllWorktrees(selectWorktreesByRepo(state)).flatMap((worktree) =>
    workspaceMatchesExecutionHost(state, worktree.id, executionHostId)
      ? [{ workspaceId: worktree.id, rootPath: worktree.path, executionHostId }]
      : []
  )
  for (const workspace of selectFolderWorkspaces(state)) {
    const workspaceId = folderWorkspaceKey(workspace.id)
    if (workspaceMatchesExecutionHost(state, workspaceId, executionHostId)) {
      roots.push({ workspaceId, rootPath: workspace.folderPath, executionHostId })
    }
  }

  const owner = findRuntimeWorkspaceFileOwner(roots, absolutePath, executionHostId)
  // Why: git's own files belong to the worktree running git, not to the checkout whose root holds
  // them - a linked worktree's COMMIT_EDITMSG lives in the main checkout's .git/worktrees/<id>/.
  return owner && owner.relativePath !== '' && !GIT_DIR_SEGMENT.test(owner.relativePath)
    ? { worktreeId: owner.workspaceId, relativePath: owner.relativePath, executionHostId }
    : null
}

const GIT_DIR_SEGMENT = /(^|[\\/])\.git([\\/]|$)/

export function findRuntimeWorkspaceFileRoute(
  state: AppState,
  runtimeEnvironmentId: string,
  absolutePath: string
): RuntimeWorkspaceFileRoute | null {
  const ownerId = runtimeEnvironmentId.trim()
  if (!ownerId) {
    return null
  }
  const executionHostId = toRuntimeExecutionHostId(ownerId)
  return findWorkspaceFileRoute(state, executionHostId, absolutePath)
}
