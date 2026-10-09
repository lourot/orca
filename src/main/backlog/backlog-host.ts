import type { Repo } from '../../shared/repo-types'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../shared/execution-host'
import type { BacklogOperation, BacklogReply } from '../../shared/backlog-types'
import { executeBacklogOperation } from './backlog-service'

/** Executes on this host only; never substitutes local files for a project owned by another host. */
export async function routeBacklogOperation(
  repo: Repo,
  operation: BacklogOperation
): Promise<BacklogReply> {
  const host = parseExecutionHostId(getRepoExecutionHostId(repo))
  if (host?.kind === 'local') {
    return executeBacklogOperation(repo.path, operation)
  }
  if (host?.kind === 'ssh') {
    // Why: the SSH relay that served backlog.execute was removed upstream (#27215).
    throw new Error('Backlog.md is not available for SSH projects. Use a paired Orca runtime.')
  }
  throw new Error('Backlog requests must be sent to the project execution runtime.')
}
