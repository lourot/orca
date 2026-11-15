import { resolve as resolvePath } from 'node:path'
import { isPathInsideOrEqual } from '../shared/cross-platform-path'
import { isFloatingWorkspaceId } from '../shared/floating-workspace-worktree'
import {
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
  toSshExecutionHostId,
  type ExecutionHostId
} from '../shared/execution-host'
import { readOrchestrationCompatibilityEvidence } from '../shared/orchestration-compatibility-evidence'
import type { RuntimeWorktreeListResult, RuntimeWorktreeRecord } from '../shared/runtime-types'
import type { RuntimeClient } from './runtime-client'
import { RuntimeClientError } from './runtime/types'
import { isLaunchedByAnotherRuntime } from './runtime/runtime-source-fence'

type CatalogRow = Pick<RuntimeWorktreeRecord, 'id' | 'path' | 'hostId'> & {
  identity?: { key: string }
}

/** SSH relays stamp the caller host; otherwise use this machine. */
export function getCallerExecutionHostId(
  env: Readonly<Record<string, string | undefined>> = process.env
): ExecutionHostId {
  const host = readOrchestrationCompatibilityEvidence(env)?.host
  return host?.kind === 'ssh' ? toSshExecutionHostId(host.targetId) : LOCAL_EXECUTION_HOST_ID
}

// Paths may exist on multiple hosts; runtime:* and unstamped rows belong to this runtime.
function isOnCallerHost(row: CatalogRow, callerHostId: ExecutionHostId): boolean {
  const rowHostId = row.hostId ?? LOCAL_EXECUTION_HOST_ID
  return parseExecutionHostId(callerHostId)?.kind === 'ssh'
    ? rowHostId === callerHostId
    : parseExecutionHostId(rowHostId)?.kind !== 'ssh'
}

// Prefer id: for repo inference; shared IDs need an exact host-qualified identity.
function toHostScopedSelector(row: CatalogRow, catalog: readonly CatalogRow[]): string {
  const sharedId = catalog.some((other) => other !== row && other.id === row.id)
  return sharedId && row.identity?.key ? `identity:${row.identity.key}` : `id:${row.id}`
}

export type HostScopedWorktreeSelection = { selector: string; worktreeId: string }

/** Prefer the innermost enclosing worktree on the caller's host. */
export function selectEnclosingWorktreeSelectionOnHost(
  catalog: readonly CatalogRow[],
  cwd: string,
  hostId: ExecutionHostId,
  callerWorktreeId?: string
): HostScopedWorktreeSelection | undefined {
  const currentPath = resolvePath(cwd)
  let enclosing: CatalogRow | undefined
  let enclosingPathLength = -1
  for (const row of catalog) {
    if (!isOnCallerHost(row, hostId)) {
      continue
    }
    const rowPath = resolvePath(row.path)
    if (!isPathInsideOrEqual(rowPath, currentPath)) {
      continue
    }
    // Folder workspaces share their project's path, so only the caller's pane can break the tie.
    if (
      rowPath.length < enclosingPathLength ||
      (rowPath.length === enclosingPathLength && row.id !== callerWorktreeId)
    ) {
      continue
    }
    enclosing = row
    enclosingPathLength = rowPath.length
  }
  return enclosing
    ? { selector: toHostScopedSelector(enclosing, catalog), worktreeId: enclosing.id }
    : undefined
}

export function selectEnclosingWorktreeOnHost(
  catalog: readonly CatalogRow[],
  cwd: string,
  hostId: ExecutionHostId
): string | undefined {
  return selectEnclosingWorktreeSelectionOnHost(catalog, cwd, hostId)?.selector
}

export function selectWorktreeIdOnHost(
  catalog: readonly CatalogRow[],
  worktreeId: string,
  hostId: ExecutionHostId
): string | undefined {
  const match = catalog.find((row) => row.id === worktreeId && isOnCallerHost(row, hostId))
  return match ? toHostScopedSelector(match, catalog) : undefined
}

/** The workspace this Orca terminal names; native folders and the floating terminal have no catalog row. */
export function selectCallerTerminalWorkspace(
  catalog: readonly CatalogRow[],
  hostId: ExecutionHostId
): string | undefined {
  const worktreeId = process.env.ORCA_WORKTREE_ID
  const trimmed = worktreeId?.trim()
  if (isFloatingWorkspaceId(worktreeId)) {
    return undefined
  }
  if (worktreeId && trimmed && !trimmed.startsWith('folder:')) {
    const scoped = selectWorktreeIdOnHost(catalog, worktreeId, hostId)
    if (!scoped) {
      throw new RuntimeClientError(
        'selector_not_found',
        `This terminal's workspace ${worktreeId} is not listed by Orca on this host. Run the command from a workspace directory or pass --worktree <selector> (or all) where the command accepts it.`
      )
    }
    return scoped
  }
  return [trimmed, process.env.ORCA_WORKSPACE_ID?.trim()].find((id) => id?.startsWith('folder:'))
}

/** The cwd's worktree, else the calling terminal's workspace; undefined keeps the runtime default. */
export async function resolveLocalCallerWorktreeSelector(
  cwd: string,
  client: RuntimeClient
): Promise<string | undefined> {
  const catalog = await client
    .call<RuntimeWorktreeListResult>('worktree.list', { limit: 10_000 })
    .then((response) => response.result.worktrees)
    .catch(() => undefined)
  // Without the catalog neither cwd nor the terminal id can be checked; keep the runtime default.
  if (!catalog) {
    return undefined
  }
  const hostId = getCallerExecutionHostId()
  const enclosing = selectEnclosingWorktreeSelectionOnHost(
    catalog,
    cwd,
    hostId,
    process.env.ORCA_WORKTREE_ID
  )
  if (enclosing || isLaunchedByAnotherRuntime(process.env, client.userDataPath)) {
    return enclosing?.selector
  }
  // An Orca terminal knows its workspace; without this an unmanaged cwd lands in the focused one.
  return selectCallerTerminalWorkspace(catalog, hostId)
}

export async function resolveCallerPaneWorktreeSelector(
  worktreeId: string,
  client: RuntimeClient
): Promise<string | undefined> {
  const callerHostId = getCallerExecutionHostId()
  if (callerHostId === LOCAL_EXECUTION_HOST_ID) {
    return worktreeId
  }
  const worktrees = await client.call<RuntimeWorktreeListResult>('worktree.list', {
    limit: 10_000
  })
  return selectWorktreeIdOnHost(worktrees.result.worktrees, worktreeId, callerHostId)
}
