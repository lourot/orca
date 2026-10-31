import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { lock } from 'proper-lockfile'
import { BacklogSaveUnconfirmedError } from './backlog-save-outcome'

// About 2 s: long enough to wait out another CLI edit, short enough to fail visibly.
const RETRIES = { retries: 20, factor: 1, minTimeout: 100, maxTimeout: 100, randomize: false }

/**
 * Holds the per-task lock the pinned Backlog CLI takes for edits (`<backlog>/.locks/task-<id>`,
 * proper-lockfile, 10 s stale; see `withEntityFileLock` in backlog.md 1.55.3). Holding it across
 * the stale-edit check and the CLI write makes the pair atomic: an agent's CLI edit of the same
 * task fails with "is being modified by another process" instead of landing in between. The CLI
 * run inside must skip its own lock (`USE_GLOBAL_TASK_ID_LOCK=false`) or it would fail on ours.
 */
export async function withBacklogTaskLock<T>(
  backlogPath: string,
  task: { id: string; filePath: string },
  apply: () => Promise<T>
): Promise<T> {
  const name =
    task.id
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^\.+/, '') || 'unknown'
  const locks = path.join(backlogPath, '.locks')
  await mkdir(locks, { recursive: true })
  let compromised: Error | undefined
  let release: () => Promise<void>
  try {
    release = await lock(task.filePath, {
      lockfilePath: path.join(locks, `task-${name}`),
      realpath: true,
      stale: 10000,
      retries: RETRIES,
      // The default rethrows from proper-lockfile's refresh timer, an uncaught main-process exception.
      onCompromised: (error) => {
        compromised = error
      }
    })
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined
    if (code === 'ELOCKED') {
      throw new Error(
        `${task.id} is being edited by another process, such as an agent. Nothing was saved; try again in a moment.`
      )
    }
    // A CLI title edit renames the file, so the listed path can be gone by now.
    if (code === 'ENOENT') {
      throw new Error('This task changed since you opened it. Refresh and edit it again.')
    }
    throw error
  }
  try {
    const result = await apply()
    if (compromised) {
      throw new BacklogSaveUnconfirmedError(
        `Lost the lock on ${task.id} during the save; refresh and inspect the task before retrying.`,
        { cause: compromised }
      )
    }
    return result
  } finally {
    // A compromised lock is already released and may belong to another process now.
    if (!compromised) {
      await release()
    }
  }
}
