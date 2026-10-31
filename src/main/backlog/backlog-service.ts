import {
  BACKLOG_OPERATION_TIMEOUT_MS,
  BacklogOperation,
  backlogTaskKey,
  sameBacklogFieldValue,
  type BacklogReply,
  type BacklogTask
} from '../../shared/backlog-types'
import {
  assertBacklogMutationPaths,
  loadBacklogProject,
  readBacklogFile,
  readBacklogTasks
} from './backlog-project'
import { parseBacklogTask } from './backlog-task-file'
import { backlogMutationUnavailable, resolveBacklogCli, runBacklogMutation } from './backlog-cli'
import { describeBacklogTask, openBacklogBlockers } from './backlog-task-relations'
import { sortBacklogTasks } from './backlog-task-order'
import { withBacklogTaskLock } from './backlog-task-lock'
import { BacklogNotSavedError, BacklogSaveUnconfirmedError } from './backlog-save-outcome'

const CHANGED_ON_DISK = 'This task changed since you opened it. Refresh and edit it again.'

/** True when a field the editor loaded no longer matches the task file; fields absent from `base` are not compared. */
function changedSinceLoaded(
  base: NonNullable<Extract<BacklogOperation, { kind: 'edit' }>['base']>,
  task: BacklogTask
): boolean {
  return (
    (['title', 'description', 'status'] as const).some((key) => base[key] !== task[key]) ||
    (
      ['priority', 'type', 'dueDate', 'assignees', 'labels', 'dependencies', 'references'] as const
    ).some((key) => {
      const loaded = base[key]
      return loaded !== undefined && !sameBacklogFieldValue(loaded, task[key])
    })
  )
}

/**
 * Title, status, priority and type checks against the task as it is now (an edit's re-read), so a
 * stored value outside the config may be kept unchanged. The CLI rejects unconfigured values too,
 * but only after spawning, with a less actionable message.
 */
function assertWritable(
  project: { statuses: string[]; priorities: string[]; types: string[] },
  operation: Extract<BacklogOperation, { kind: 'create' | 'edit' }>,
  current: BacklogTask | null
): void {
  if (
    !operation.title.trim() ||
    (!project.statuses.includes(operation.status) && operation.status !== current?.status)
  ) {
    throw new Error('A title and a configured Backlog status are required.')
  }
  for (const [key, label, allowed] of [
    ['priority', 'Priority', project.priorities],
    ['type', 'Type', project.types]
  ] as const) {
    const value = operation[key]
    if (
      value &&
      !sameBacklogFieldValue(value, current?.[key] ?? '') &&
      !allowed.some((entry) => sameBacklogFieldValue(entry, value))
    ) {
      throw new Error(`${label} must be one of: ${allowed.join(', ')}.`)
    }
  }
}

/** Bounds caller wait and signals CLI cancellation; a timeout does not establish whether a write completed. */
export async function executeBacklogOperation(
  repoPath: string,
  input: BacklogOperation
): Promise<BacklogReply> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>(
    /** Starts the overall deadline before project scanning or CLI execution can block the caller. */
    (_, reject) => {
      timer = setTimeout(
        /** Requests cancellation without claiming that a pending CLI write was rolled back. */
        () => {
          controller.abort()
          reject(
            new Error(
              'Backlog operation timed out. Completion is unconfirmed; refresh and inspect tasks before retrying.'
            )
          )
        },
        BACKLOG_OPERATION_TIMEOUT_MS
      )
    }
  )
  try {
    return await Promise.race([executeOperation(repoPath, input, controller.signal), deadline])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Classifies a failed save for the editor: anything thrown before the CLI ran (config, lock, stale
 * check, validation, missing CLI) left the task untouched and becomes BacklogNotSavedError, which
 * clients may retry. Only a CLI run that did not confirm stays unconfirmed.
 */
async function executeOperation(
  repoPath: string,
  input: BacklogOperation,
  signal: AbortSignal
): Promise<BacklogReply> {
  const operation = BacklogOperation.parse(input)
  if (operation.kind === 'list' || operation.kind === 'read') {
    return runOperation(repoPath, operation, signal)
  }
  try {
    return await runOperation(repoPath, operation, signal)
  } catch (error) {
    if (error instanceof BacklogSaveUnconfirmedError || error instanceof BacklogNotSavedError) {
      throw error
    }
    throw new BacklogNotSavedError(error instanceof Error ? error.message : String(error), {
      cause: error
    })
  }
}

/** Validates host-local reads and gates CLI writes on project, task-hook, and path safety checks. */
async function runOperation(
  repoPath: string,
  operation: BacklogOperation,
  signal: AbortSignal
): Promise<BacklogReply> {
  const project = await loadBacklogProject(repoPath)
  const tasks = await readBacklogTasks(project)
  if (operation.kind === 'list') {
    let mutationUnavailable = backlogMutationUnavailable(project)
    if (!mutationUnavailable) {
      try {
        await resolveBacklogCli(project)
      } catch (error) {
        mutationUnavailable = error instanceof Error ? error.message : String(error)
      }
    }
    const search = operation.search.toLocaleLowerCase()
    const byKey = new Map(tasks.map((task) => [backlogTaskKey(task.id), task]))
    const matching = tasks.filter(
      (task) =>
        (!operation.status || task.status === operation.status) &&
        `${task.id}\n${task.title}\n${task.labels.join('\n')}\n${task.body}`
          .toLocaleLowerCase()
          .includes(search)
    )
    return {
      projectPath: project.root,
      projectName: project.projectName,
      statuses: project.statuses,
      priorities: project.priorities,
      types: project.types,
      tasks: sortBacklogTasks(matching, project)
        .slice(operation.offset, operation.offset + 100)
        .map(({ id, title, status, priority, labels, type, dueDate, dependencies }) => ({
          id,
          title,
          status,
          priority,
          labels,
          type,
          dueDate,
          blockedBy: openBacklogBlockers({ dependencies }, byKey, project.statuses)
        })),
      total: matching.length,
      mutationUnavailable
    }
  }
  const task =
    operation.kind === 'create' ? null : tasks.find((candidate) => candidate.id === operation.id)
  if (operation.kind !== 'create' && !task) {
    throw new Error('Backlog task not found. Refresh the list.')
  }
  if (operation.kind === 'read' && task) {
    const { hasStatusHook: _hook, filePath: _path, ...detail } = task
    return describeBacklogTask(detail, tasks)
  }
  if (operation.kind === 'read') {
    throw new Error('Backlog task not found.')
  }
  const unavailable = backlogMutationUnavailable(project)
  if (unavailable) {
    throw new Error(unavailable)
  }
  if (!task) {
    assertWritable(project, operation, null)
    await assertBacklogMutationPaths(project.backlogPath)
    signal.throwIfAborted()
    await runBacklogMutation(project, operation, null, signal)
    return { saved: true }
  }
  await assertBacklogMutationPaths(project.backlogPath)
  // Why: agents edit tasks through the CLI too. Re-reading, checking and writing under the CLI's
  // own task lock means a concurrent agent edit either lands before the check or waits until after.
  await withBacklogTaskLock(project.backlogPath, task, async () => {
    const current = await readBacklogFile(task.filePath)
      .then(parseBacklogTask)
      .catch(() => null)
    if (!current || backlogTaskKey(current.id) !== backlogTaskKey(task.id)) {
      throw new Error(CHANGED_ON_DISK)
    }
    if (current.hasStatusHook) {
      throw new Error(
        'This task has an onStatusChange hook. Edit it with the Backlog CLI directly.'
      )
    }
    if (
      operation.kind === 'edit' &&
      operation.base &&
      changedSinceLoaded(operation.base, current)
    ) {
      throw new Error(CHANGED_ON_DISK)
    }
    assertWritable(project, operation, current)
    signal.throwIfAborted()
    await runBacklogMutation(project, operation, current, signal)
  })
  return { saved: true }
}
