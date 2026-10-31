import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { resolveBacklogCli } from './backlog-cli'
import { loadBacklogProject } from './backlog-project'
import { BACKLOG_CLI_VERSION } from '../../shared/backlog-types'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const nativeName = `backlog.md-${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`

async function writePackage(dir: string, manifest: object): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'package.json'), JSON.stringify(manifest))
}

/** Builds outer/project with the pinned cli.js shim; the native package goes where `native` says. */
async function project(native: 'project' | 'parent' | 'none', nativeVersion = BACKLOG_CLI_VERSION) {
  const outer = await realpath(await mkdtemp(path.join(tmpdir(), 'orca-backlog-cli-')))
  roots.push(outer)
  const root = path.join(outer, 'project')
  await mkdir(path.join(root, 'backlog', 'tasks'), { recursive: true })
  await writeFile(path.join(root, 'backlog.config.yml'), 'project_name: Sample\n')
  const shim = path.join(root, 'node_modules', 'backlog.md')
  await writePackage(shim, {
    name: 'backlog.md',
    version: BACKLOG_CLI_VERSION,
    bin: { backlog: 'cli.js' }
  })
  await writeFile(path.join(shim, 'cli.js'), '')
  if (native !== 'none') {
    const base = native === 'project' ? root : outer
    await writePackage(path.join(base, 'node_modules', nativeName), {
      name: nativeName,
      version: nativeVersion
    })
  }
  return loadBacklogProject(root)
}

describe('resolveBacklogCli', () => {
  it('accepts the pinned shim when its native binary package is pinned inside the project', async () => {
    const loaded = await project('project')
    await expect(resolveBacklogCli(loaded)).resolves.toBe(
      path.join(loaded.root, 'node_modules', 'backlog.md', 'cli.js')
    )
  })

  it.each([
    ['the native package is missing', 'none', BACKLOG_CLI_VERSION],
    ['Node would load the native package from a parent folder', 'parent', BACKLOG_CLI_VERSION],
    ['the native package is another version', 'project', '1.4.0']
  ] as const)('refuses to run the CLI when %s', async (_, native, version) => {
    await expect(resolveBacklogCli(await project(native, version))).rejects.toThrow(
      `Install backlog.md@${BACKLOG_CLI_VERSION}`
    )
  })
})
