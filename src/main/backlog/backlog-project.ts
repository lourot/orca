import { lstat, open, opendir, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'
import { backlogTaskKey } from '../../shared/backlog-types'
import { parseBacklogTask } from './backlog-task-file'

const Config = z.object({
  project_name: z.string().optional(),
  projectName: z.string().optional(),
  backlog_directory: z.string().optional(),
  backlogDirectory: z.string().optional(),
  statuses: z
    .array(z.string().min(1).max(200))
    .min(1)
    .max(100)
    .default(['To Do', 'In Progress', 'Done']),
  // Backlog.md's own defaults (`task create --help`, 1.55.3) when the config names none.
  priorities: z
    .array(z.string().min(1).max(200))
    .max(100)
    .default(['High', 'Medium', 'Low'])
    .catch(['High', 'Medium', 'Low']),
  types: z
    .array(z.string().min(1).max(200))
    .max(100)
    .default(['bug', 'feature', 'enhancement', 'task', 'chore', 'docs', 'spike'])
    .catch(['bug', 'feature', 'enhancement', 'task', 'chore', 'docs', 'spike']),
  auto_commit: z.boolean().optional(),
  autoCommit: z.boolean().optional(),
  remote_operations: z.boolean().optional(),
  remoteOperations: z.boolean().optional(),
  check_active_branches: z.boolean().optional(),
  checkActiveBranches: z.boolean().optional(),
  onStatusChange: z.string().optional(),
  on_status_change: z.string().optional()
})
/** Reads bounded UTF-8 from a regular file, rejecting symlinks at lstat and using O_NOFOLLOW off Windows. */
export async function readBacklogFile(file: string, maxBytes = 131072): Promise<string> {
  const entry = await lstat(file)
  if (!entry.isFile()) {
    throw new Error(`Backlog requires a regular file, not a symlink or special file: ${file}`)
  }
  const handle = await open(
    file,
    constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW)
  )
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > maxBytes) {
      throw new Error(`Backlog file exceeds the ${maxBytes}-byte limit: ${file}`)
    }
    const buffer = Buffer.alloc(maxBytes + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    if (bytesRead > maxBytes) {
      throw new Error(`Backlog file grew beyond the read limit: ${file}`)
    }
    return buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
}

/** Treats only ENOENT as absent; permission and other filesystem errors remain blocking. */
export async function backlogPathExists(file: string): Promise<boolean> {
  try {
    await lstat(file)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

/** Resolves existing project-relative segments, rejecting traversal and symlinks at inspection time. */
export async function containedBacklogPath(root: string, relative: string): Promise<string> {
  if (
    !relative ||
    path.isAbsolute(relative) ||
    /^[a-zA-Z]:/.test(relative) ||
    relative.includes('\\')
  ) {
    throw new Error('Backlog paths must be project-relative.')
  }
  const parts = relative.split('/')
  if (parts.some((part) => part === '..' || part === '.' || !part)) {
    throw new Error('Backlog path traversal is not allowed.')
  }
  let current = root
  for (const part of parts) {
    current = path.join(current, part)
    if ((await lstat(current)).isSymbolicLink()) {
      throw new Error(`Backlog symlinks are not supported: ${current}`)
    }
  }
  return current
}

/** Loads root or conventional Backlog config and records CLI safety/identity mismatches without executing it. */
export async function loadBacklogProject(repoPath: string) {
  const root = await realpath(repoPath)
  const rootConfig = await backlogPathExists(path.join(root, 'backlog.config.yml'))
  let directory: string | undefined
  let configPath: string | undefined
  for (const candidate of ['backlog', '.backlog']) {
    for (const name of ['config.yml', 'config.yaml']) {
      const relative = `${candidate}/${name}`
      if (!configPath && (await backlogPathExists(path.join(root, relative)))) {
        configPath = relative
        directory = candidate
      }
    }
  }
  if (rootConfig) {
    configPath = 'backlog.config.yml'
  }
  if (!configPath) {
    throw new Error(
      'No Backlog.md configuration in this project. Initialize Backlog.md in the selected project first.'
    )
  }
  const configText = await readBacklogFile(await containedBacklogPath(root, configPath), 32768)
  const config = Config.parse(parse(configText))
  // Backlog 1.48-1.55 reads these keys line-by-line, including indented lines.
  const cliEntries = configText.split('\n').flatMap((line) => {
    const trimmed = line.trim()
    const colon = trimmed.indexOf(':')
    if (trimmed.startsWith('#') || colon === -1) {
      return []
    }
    return [{ key: trimmed.slice(0, colon).trim(), value: trimmed.slice(colon + 1).trim() }]
  })
  const cliConfig = new Map(cliEntries.map(({ key, value }) => [key, value]))
  const unsafeCliConfig =
    cliConfig.get('remote_operations')?.toLowerCase() !== 'false' ||
    cliConfig.get('check_active_branches')?.toLowerCase() !== 'false' ||
    cliEntries.some(({ key, value }) => {
      switch (key) {
        case 'auto_commit':
          return value.toLowerCase() === 'true'
        case 'onStatusChange':
        case 'on_status_change':
          return Boolean(value.replace(/^['"]|['"]$/g, ''))
        case 'remote_operations':
        case 'check_active_branches':
          return value.toLowerCase() !== 'false'
        default:
          return false
      }
    })
  if (rootConfig) {
    directory = config.backlog_directory ?? config.backlogDirectory ?? directory
    if (!directory) {
      for (const candidate of ['backlog', '.backlog']) {
        if (await backlogPathExists(path.join(root, candidate))) {
          directory = candidate
          break
        }
      }
    }
  }
  const projectName = config.project_name ?? config.projectName
  if (!projectName || !directory) {
    throw new Error(
      'Backlog.md configuration needs a project name and an existing backlog directory.'
    )
  }
  const backlogPath = await containedBacklogPath(root, directory)
  const configMatchesCli =
    cliConfig.get('project_name')?.replace(/['"]/g, '') === projectName &&
    cliEntries.every(({ key, value }) => {
      if (key === 'project_name') {
        return value.replace(/['"]/g, '') === projectName
      }
      if (key === 'backlog_directory' || key === 'backlogDirectory') {
        return rootConfig && value.replace(/['"]/g, '') === directory
      }
      return true
    })
  return {
    root,
    backlogPath,
    projectName,
    statuses: config.statuses,
    priorities: config.priorities,
    types: config.types,
    config,
    unsafeCliConfig,
    configMatchesCli
  }
}

export type BacklogProject = Awaited<ReturnType<typeof loadBacklogProject>>

/** Reads active tasks in numeric ID order; rejects symlinks, duplicate IDs, and scan/read limit violations. */
export async function readBacklogTasks(project: BacklogProject) {
  const tasksPath = path.join(project.backlogPath, 'tasks')
  if (!(await backlogPathExists(tasksPath))) {
    return []
  }
  if ((await lstat(tasksPath)).isSymbolicLink()) {
    throw new Error('Backlog task directory cannot be a symlink.')
  }
  const directory = await opendir(tasksPath)
  const tasks: (ReturnType<typeof parseBacklogTask> & { filePath: string })[] = []
  const ids = new Set<string>()
  let entries = 0
  let bytes = 0
  for await (const entry of directory) {
    if (++entries > 10000) {
      throw new Error('Backlog directory exceeds the 10,000-entry limit.')
    }
    if (entry.isSymbolicLink()) {
      throw new Error('Backlog task symlinks are not supported.')
    }
    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue
    }
    const filePath = path.join(tasksPath, entry.name)
    const content = await readBacklogFile(filePath)
    bytes += Buffer.byteLength(content)
    if (bytes > 16 * 1024 * 1024) {
      throw new Error('Backlog tasks exceed the 16 MiB read limit.')
    }
    const task = parseBacklogTask(content)
    const key = backlogTaskKey(task.id)
    if (ids.has(key)) {
      throw new Error(`Duplicate Backlog task ID: ${task.id}. Run backlog doctor.`)
    }
    ids.add(key)
    tasks.push({ ...task, filePath })
  }
  const collator = new Intl.Collator(undefined, { numeric: true })
  return tasks.sort((a, b) => collator.compare(a.id, b.id))
}

/** Bounds the recursive CLI scan and rejects symlinks, including completed/archive paths used for ID resolution. */
export async function assertBacklogMutationPaths(
  directory: string,
  budget = { entries: 0 },
  depth = 0
): Promise<void> {
  if (depth > 12) {
    throw new Error('Backlog directory nesting exceeds the supported limit.')
  }
  for await (const entry of await opendir(directory)) {
    if (++budget.entries > 10000) {
      throw new Error('Backlog directory exceeds the mutation safety limit.')
    }
    if (entry.isSymbolicLink()) {
      throw new Error('Remove Backlog symlinks before editing tasks in Orca.')
    }
    if (entry.isDirectory()) {
      await assertBacklogMutationPaths(path.join(directory, entry.name), budget, depth + 1)
    }
  }
}
