import path from 'node:path'
import { realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { z } from 'zod'
import {
  BACKLOG_CLI_VERSION,
  type BacklogOperation,
  type BacklogTask
} from '../../shared/backlog-types'
import { runProcess } from '@orca/process-host'
import { readBacklogFile, type BacklogProject } from './backlog-project'

const Package = z.object({
  name: z.literal('backlog.md'),
  version: z.literal(BACKLOG_CLI_VERSION),
  bin: z.object({ backlog: z.literal('cli.js') })
})
const NativePackage = z.object({ name: z.string(), version: z.literal(BACKLOG_CLI_VERSION) })
const INSTALL_MESSAGE = `Install backlog.md@${BACKLOG_CLI_VERSION} as a pinned dependency in this project on its execution host. Orca never downloads a CLI automatically.`

function isOutsideProject(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)
}

/** Native packages cli.js may load, as its resolveBinary.cjs names them; darwin runs either arch. */
function nativePackageCandidates(): string[] {
  const platform = process.platform === 'win32' ? 'windows' : process.platform
  const arches = process.platform === 'darwin' ? ['arm64', 'x64'] : [process.arch]
  return arches.map((arch) => `backlog.md-${platform}-${arch}`)
}

/**
 * cli.js is a shim that runs a native binary found by Node module lookup, which also searches
 * parent folders. Every candidate it could load must be the pinned version inside the project.
 */
async function assertNativePackagesPinned(project: BacklogProject, cli: string): Promise<void> {
  const resolveFromCli = createRequire(cli).resolve
  let found = false
  for (const name of nativePackageCandidates()) {
    let manifest: string
    try {
      manifest = await realpath(resolveFromCli(`${name}/package.json`))
    } catch {
      continue
    }
    if (isOutsideProject(project.root, manifest)) {
      throw new Error('Native CLI outside project')
    }
    const parsed = NativePackage.parse(JSON.parse(await readBacklogFile(manifest, 32768)))
    if (parsed.name !== name) {
      throw new Error('Unexpected native CLI package')
    }
    found = true
  }
  if (!found) {
    throw new Error('Native CLI missing')
  }
}

/** Requires the pinned CLI and its native binary inside this checkout; never searches PATH or installs packages. */
export async function resolveBacklogCli(project: BacklogProject): Promise<string> {
  try {
    const packageDir = await realpath(path.join(project.root, 'node_modules', 'backlog.md'))
    if (isOutsideProject(project.root, packageDir)) {
      throw new Error('CLI outside project')
    }
    Package.parse(JSON.parse(await readBacklogFile(path.join(packageDir, 'package.json'), 32768)))
    const cli = await realpath(path.join(packageDir, 'cli.js'))
    if (path.dirname(cli) !== packageDir) {
      throw new Error('CLI outside package')
    }
    await assertNativePackagesPinned(project, cli)
    return cli
  } catch {
    throw new Error(INSTALL_MESSAGE)
  }
}

/** Returns the configuration reason edits are blocked, or null; does not check CLI availability. */
export function backlogMutationUnavailable(project: BacklogProject): string | null {
  const config = project.config
  if (!project.configMatchesCli) {
    return 'Normalize this project configuration with the Backlog CLI before editing in Orca.'
  }
  if (
    project.unsafeCliConfig ||
    config.auto_commit ||
    config.autoCommit ||
    config.onStatusChange ||
    config.on_status_change
  ) {
    return 'Disable Backlog autoCommit and onStatusChange before editing in Orca, or use the Backlog CLI directly.'
  }
  if (config.remote_operations !== false || config.check_active_branches !== false) {
    return 'Set remote_operations and check_active_branches to false (backlog config set remoteOperations false, and the same for checkActiveBranches) before editing in Orca to keep task operations local to this checkout.'
  }
  return null
}

/** Emits only changed edit fields and separates user text from CLI option parsing. */
export function backlogMutationArgs(
  operation: Extract<BacklogOperation, { kind: 'create' | 'edit' }>,
  previous?: BacklogTask | null
): string[] {
  const fields = (['title', 'description', 'status'] as const)
    .filter((field) => !previous || operation[field] !== previous[field])
    .map((field) => `--${field}=${operation[field]}`)
  return operation.kind === 'edit'
    ? ['task', 'edit', operation.id, ...fields, '--plain']
    : ['task', 'create', ...fields.slice(1), '--plain', '--', operation.title]
}

/** Runs the pinned CLI with bounded time/output; failures leave completion unconfirmed, not rolled back. */
export async function runBacklogMutation(
  project: BacklogProject,
  operation: Extract<BacklogOperation, { kind: 'create' | 'edit' }>,
  previous: BacklogTask | null,
  signal: AbortSignal
): Promise<void> {
  const cli = await resolveBacklogCli(project)
  signal.throwIfAborted()
  const result = await runProcess({
    signal,
    program: process.execPath,
    args: [cli, ...backlogMutationArgs(operation, previous)],
    cwd: project.root,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      BACKLOG_CWD: project.root,
      CI: '1',
      NO_COLOR: '1',
      GIT_TERMINAL_PROMPT: '0'
    },
    timeoutMs: 30000,
    maxOutputBytes: 262144,
    killOnOutputLimit: true,
    detached: process.platform !== 'win32',
    terminationBarrier: true
  })
  if (result.code !== 0 || result.timedOut || result.outputTruncated) {
    throw new Error(
      `Backlog CLI did not confirm completion. Refresh tasks before retrying. ${result.stderr.slice(0, 2000)}`
    )
  }
}
