import type { Repo } from '../../../shared/repo-types'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../shared/execution-host'
import {
  BACKLOG_TASKS_CAPABILITY,
  BACKLOG_TASK_FIELDS_CAPABILITY
} from '../../../shared/backlog-capability'
import {
  BacklogReply,
  BACKLOG_RPC_TIMEOUT_MS,
  type BacklogOperation,
  type BacklogTask
} from '../../../shared/backlog-types'
import { callRuntimeRpc, assertRuntimeEnvironmentCapability } from '@/runtime/runtime-rpc-client'
import { buildContainedLinkedContextBlock } from './linked-work-item-context'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { ExecutionHostRegistryEntry } from '../../../shared/execution-host-registry'

/** Local projects are supported, runtime projects when advertised; SSH projects are not (no relay). */
export function supportsBacklog(
  repo: Repo,
  hosts: ReadonlyMap<ExecutionHostId, Pick<ExecutionHostRegistryEntry, 'capabilities'>>
): boolean {
  const hostId = getRepoExecutionHostId(repo)
  if (hostId.startsWith('ssh:')) {
    return false
  }
  return (
    !hostId.startsWith('runtime:') ||
    Boolean(hosts.get(hostId)?.capabilities?.includes(BACKLOG_TASKS_CAPABILITY))
  )
}

/** Local projects run this build; a runtime host must advertise the fields capability or it drops them. */
export function supportsBacklogFieldEdits(
  repo: Repo,
  hosts: ReadonlyMap<ExecutionHostId, Pick<ExecutionHostRegistryEntry, 'capabilities'>>
): boolean {
  const hostId = getRepoExecutionHostId(repo)
  return (
    !hostId.startsWith('runtime:') ||
    Boolean(hosts.get(hostId)?.capabilities?.includes(BACKLOG_TASK_FIELDS_CAPABILITY))
  )
}

/** Keys project UI state by host, repo ID, and checkout path to avoid cross-host reuse. */
export function backlogRepoKey(repo: Repo): string {
  return JSON.stringify([getRepoExecutionHostId(repo), repo.id, repo.path])
}

/** Uses the owning runtime (the local one for local projects), checks its capability, and validates the reply. */
export async function callBacklog(repo: Repo, operation: BacklogOperation): Promise<BacklogReply> {
  const host = parseExecutionHostId(getRepoExecutionHostId(repo))
  const target =
    host?.kind === 'runtime'
      ? { kind: 'environment' as const, environmentId: host.environmentId }
      : { kind: 'local' as const }
  if (target.kind === 'environment') {
    await assertRuntimeEnvironmentCapability(
      target.environmentId,
      BACKLOG_TASKS_CAPABILITY,
      'Update the project’s Orca server to use Backlog.md.'
    )
  }
  return BacklogReply.parse(
    await callRuntimeRpc(
      target,
      'backlog.execute',
      { repoId: repo.id, operation },
      { timeoutMs: BACKLOG_RPC_TIMEOUT_MS }
    )
  )
}

/** Picks the project named by the task's first resolvable `repo:<name>` label on the board's host, else the board's own. */
export function resolveBacklogLaunchRepo(
  task: Pick<BacklogTask, 'labels'>,
  boardRepo: Repo,
  repos: readonly Repo[]
): Repo {
  const hostId = getRepoExecutionHostId(boardRepo)
  for (const label of task.labels) {
    const name = label.startsWith('repo:') ? label.slice('repo:'.length).trim() : ''
    const match =
      name &&
      repos.find(
        (candidate) =>
          candidate.displayName === name && getRepoExecutionHostId(candidate) === hostId
      )
    if (match) {
      return match
    }
  }
  return boardRepo
}

/** Pairs board-located CLI workflow instructions with contained task data for a reviewable composer draft. */
export function buildBacklogTaskPrompt(
  task: Pick<BacklogTask, 'id' | 'title' | 'body'>,
  context: TaskSourceContext
): string {
  const boardPath =
    context.providerIdentity?.provider === 'backlog' ? context.providerIdentity.projectPath : ''
  return [
    [
      `Pick up and work on task ${task.id} from the Backlog.md task board in \`${boardPath}\`.`,
      'That board directory may be a different repository from this workspace: make the code changes in this workspace, and run the Backlog CLI only from the board directory.',
      'Before starting, read the board directory’s AGENTS.md or CLAUDE.md and follow its task workflow: which Backlog CLI to run, claiming the task, recording progress, and moving it to Done or releasing it when you finish. If you have a skill for picking up board tasks, use it.',
      'Read the current task with that CLI rather than relying on the copy below. Do not hand-edit task Markdown.'
    ].join(' '),
    buildContainedLinkedContextBlock({
      provider: 'backlog',
      version: 1,
      renderedText: `Project: ${context.projectId}\nHost: ${context.hostId}\nBoard checkout: ${boardPath}\nTask: ${task.id}\nTitle: ${task.title}\n\n${task.body}`
    })
  ].join('\n\n')
}

/** Rejects Backlog launches on another host, where the board path does not resolve; any project there is fine. */
export function assertBacklogLaunchTarget(
  context: TaskSourceContext | null,
  hostId: ExecutionHostId | null
): void {
  if (context?.provider !== 'backlog') {
    return
  }
  if (context.hostId !== hostId) {
    throw new Error('Select a project on the Backlog task’s execution host before launching.')
  }
}
