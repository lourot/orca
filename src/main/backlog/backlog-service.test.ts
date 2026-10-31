import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile, cp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { executeBacklogOperation } from './backlog-service'
import { backlogMutationArgs } from './backlog-cli'
import * as backlogCli from './backlog-cli'
import {
  BACKLOG_CLI_VERSION,
  BACKLOG_NOT_SAVED_CODE,
  BacklogOperation
} from '../../shared/backlog-types'
import { runProcess } from '@orca/process-host'
import { lock } from 'proper-lockfile'
import { existsSync } from 'node:fs'
import { withBacklogTaskLock } from './backlog-task-lock'

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
/** Creates an isolated project with automatic commits, remote scans and branch checks disabled. */
async function fixture(directory = 'backlog') {
  const root = await mkdtemp(path.join(tmpdir(), 'orca-backlog-'))
  roots.push(root)
  await mkdir(path.join(root, directory, 'tasks'), { recursive: true })
  await writeFile(
    path.join(root, 'backlog.config.yml'),
    `project_name: Sample\nbacklog_directory: ${directory}\nstatuses: [Inbox, "In review", Released]\nremote_operations: false\ncheck_active_branches: false\nauto_commit: false\n`
  )
  return root
}
/** Seeds a lowercase filename and structured body to detect ID lookup and CLI-edit data loss. */
async function task(root: string, id: string, status = 'In review', directory = 'backlog') {
  await writeFile(
    path.join(root, directory, 'tasks', `${id.toLowerCase()} - sample.md`),
    `---\nid: ${id}\ntitle: "Unicode café: task"\nstatus: ${status}\n---\n## Description\n<!-- SECTION:DESCRIPTION:BEGIN -->\nLine one\nLine two\n<!-- SECTION:DESCRIPTION:END -->\n\n## Acceptance Criteria\n- [ ] Preserve this\n`
  )
}

describe('Backlog project operations', () => {
  it.each(['backlog', '.backlog', 'planning/work'])(
    'reads configured IDs, statuses and complete details in %s',
    async (directory) => {
      const root = await fixture(directory)
      await task(root, 'OPS-007.2', 'In review', directory)
      await task(root, 'OPS-008', 'Released', directory)
      const list = await executeBacklogOperation(root, {
        kind: 'list',
        search: 'café',
        status: 'In review',
        offset: 0
      })
      expect(list).toMatchObject({
        statuses: ['Inbox', 'In review', 'Released'],
        total: 1,
        tasks: [{ id: 'OPS-007.2', status: 'In review' }]
      })
      expect(list).toHaveProperty(
        'mutationUnavailable',
        expect.stringContaining(`backlog.md@${BACKLOG_CLI_VERSION}`)
      )
      const detail = await executeBacklogOperation(root, { kind: 'read', id: 'OPS-007.2' })
      expect(detail).toMatchObject({
        description: 'Line one\nLine two',
        body: expect.stringContaining('Preserve this')
      })
    }
  )
  it('preserves the configuration reason when the CLI is also unavailable', async () => {
    const root = await fixture()
    await writeFile(
      path.join(root, 'backlog.config.yml'),
      'project_name: Sample\nbacklog_directory: backlog\nauto_commit: true\n'
    )
    const resolveCli = vi.spyOn(backlogCli, 'resolveBacklogCli')
    expect(
      await executeBacklogOperation(root, { kind: 'list', search: '', status: '', offset: 0 })
    ).toHaveProperty('mutationUnavailable', expect.stringContaining('Disable Backlog autoCommit'))
    expect(resolveCli).not.toHaveBeenCalled()
  })
  it('rejects a new unconfigured status even when the old status is unconfigured', async () => {
    const root = await fixture()
    await task(root, 'OPS-1', 'Legacy')
    await expect(
      executeBacklogOperation(root, {
        kind: 'edit',
        id: 'OPS-1',
        title: 'Changed',
        description: '',
        status: 'Unknown'
      })
    ).rejects.toThrow('configured Backlog status')
  })
  it('rejects a missing config, traversal, and duplicate IDs', async () => {
    const root = await fixture()
    await rm(path.join(root, 'backlog.config.yml'))
    await expect(
      executeBacklogOperation(root, { kind: 'list', search: '', status: '', offset: 0 })
    ).rejects.toThrow('No Backlog.md configuration')
    await writeFile(
      path.join(root, 'backlog.config.yml'),
      'project_name: Bad\nbacklog_directory: ../escape\n'
    )
    await expect(
      executeBacklogOperation(root, { kind: 'list', search: '', status: '', offset: 0 })
    ).rejects.toThrow('traversal')
    const valid = await fixture()
    await task(valid, 'OPS-1')
    await cp(
      path.join(valid, 'backlog/tasks/ops-1 - sample.md'),
      path.join(valid, 'backlog/tasks/ops-1 - duplicate.md')
    )
    await expect(
      executeBacklogOperation(valid, { kind: 'list', search: '', status: '', offset: 0 })
    ).rejects.toThrow('Duplicate')
  })
  it('refuses symlinked task files and directories', async () => {
    const root = await fixture()
    const outside = await fixture()
    await task(outside, 'OPS-1')
    await symlink(
      path.join(outside, 'backlog/tasks/ops-1 - sample.md'),
      path.join(root, 'backlog/tasks/ops-1 - sample.md')
    )
    await expect(executeBacklogOperation(root, { kind: 'read', id: 'OPS-1' })).rejects.toThrow(
      'symlink'
    )
    await rm(path.join(root, 'backlog/tasks'), { recursive: true })
    await symlink(path.join(outside, 'backlog/tasks'), path.join(root, 'backlog/tasks'), 'junction')
    await expect(executeBacklogOperation(root, { kind: 'read', id: 'OPS-1' })).rejects.toThrow(
      'symlink'
    )
  })
  it('caps task reads and list pages', async () => {
    const root = await fixture()
    for (let index = 0; index < 103; index++) {
      await task(root, `OPS-${index}`)
    }
    const page = await executeBacklogOperation(root, {
      kind: 'list',
      search: '',
      status: '',
      offset: 100
    })
    expect(page).toMatchObject({
      total: 103,
      tasks: [{ id: 'OPS-100' }, { id: 'OPS-101' }, { id: 'OPS-102' }]
    })
    await writeFile(path.join(root, 'backlog/tasks/huge.md'), 'x'.repeat(131073))
    await expect(
      executeBacklogOperation(root, { kind: 'list', search: '', status: '', offset: 0 })
    ).rejects.toThrow('limit')
  })
  it('sorts the whole list before paging and lists only open blockers', async () => {
    const root = await fixture()
    for (let index = 0; index < 100; index++) {
      await task(root, `OPS-${index}`, index === 2 ? 'Released' : 'In review')
    }
    await writeFile(
      path.join(root, 'backlog/tasks/ops-100 - urgent.md'),
      '---\nid: OPS-100\ntitle: Urgent\nstatus: Inbox\npriority: high\ntype: bug\ndue_date: 2026-11-02\ndependencies: [OPS-1, OPS-2, OPS-999]\n---\n'
    )
    const page = await executeBacklogOperation(root, {
      kind: 'list',
      search: '',
      status: '',
      offset: 0
    })
    expect(page).toHaveProperty('total', 101)
    expect('tasks' in page && page.tasks[0]).toEqual({
      id: 'OPS-100',
      title: 'Urgent',
      status: 'Inbox',
      priority: 'high',
      labels: [],
      type: 'bug',
      dueDate: '2026-11-02',
      blockedBy: ['OPS-1']
    })
    // The done task sinks past the first page.
    expect(
      await executeBacklogOperation(root, { kind: 'list', search: '', status: '', offset: 100 })
    ).toMatchObject({ tasks: [{ id: 'OPS-2' }] })
  })
  it('refuses mutations without the CLI or with executable hooks/autocommit', async () => {
    const root = await fixture()
    const create = { kind: 'create', title: 'Task', description: '', status: 'Inbox' } as const
    await expect(executeBacklogOperation(root, create)).rejects.toThrow(
      `Install backlog.md@${BACKLOG_CLI_VERSION}`
    )
    await writeFile(
      path.join(root, 'backlog.config.yml'),
      'project_name: Sample\nbacklog_directory: backlog\nauto_commit: true\n'
    )
    await expect(executeBacklogOperation(root, create)).rejects.toThrow(
      'Disable Backlog autoCommit'
    )
  })
  it('refuses an edit whose fields changed on disk since the editor loaded them', async () => {
    const root = await fixture()
    await task(root, 'OPS-1')
    const loaded = { title: 'Unicode café: task', description: 'Line one\nLine two' }
    const edit = { kind: 'edit', id: 'OPS-1', ...loaded, title: 'Renamed' } as const
    await expect(
      executeBacklogOperation(root, {
        ...edit,
        status: 'In review',
        base: { ...loaded, status: 'Inbox' }
      })
    ).rejects.toThrow('changed since you opened it')
    await expect(
      executeBacklogOperation(root, {
        ...edit,
        status: 'In review',
        base: { ...loaded, status: 'In review' }
      })
    ).rejects.toThrow(`Install backlog.md@${BACKLOG_CLI_VERSION}`)
  })
  it('refuses an edit whose label changed on disk since the editor loaded it', async () => {
    const root = await fixture()
    await task(root, 'OPS-1')
    const loaded = {
      title: 'Unicode café: task',
      description: 'Line one\nLine two',
      status: 'In review'
    }
    await expect(
      executeBacklogOperation(root, {
        kind: 'edit',
        id: 'OPS-1',
        ...loaded,
        labels: ['mine'],
        base: { ...loaded, labels: ['stale'] }
      })
    ).rejects.toThrow('changed since you opened it')
  })
  it('waits out, then refuses, an edit while another process holds the task lock', async () => {
    const root = await fixture()
    await task(root, 'OPS-1')
    const file = path.join(root, 'backlog/tasks/ops-1 - sample.md')
    const lockPath = path.join(root, 'backlog/.locks/task-ops-1')
    await mkdir(path.dirname(lockPath), { recursive: true })
    const edit = {
      kind: 'edit',
      id: 'OPS-1',
      title: 'Renamed',
      description: 'Line one\nLine two',
      status: 'In review'
    } as const
    const release = await lock(file, { lockfilePath: lockPath, realpath: true })
    // A certain no-write: the editor may offer a retry instead of an unconfirmed-save lockout.
    await expect(executeBacklogOperation(root, edit)).rejects.toMatchObject({
      code: BACKLOG_NOT_SAVED_CODE,
      message: expect.stringContaining('being edited by another process')
    })
    await release()
    // Free again, the edit gets past the lock (and stops at the missing CLI), then releases it.
    await expect(executeBacklogOperation(root, edit)).rejects.toThrow(
      `Install backlog.md@${BACKLOG_CLI_VERSION}`
    )
    expect(existsSync(lockPath)).toBe(false)
  })
  it('rejects padded-ID collisions and hidden CLI configuration effects', async () => {
    const root = await fixture()
    await task(root, 'OPS-01')
    await task(root, 'OPS-1')
    await expect(
      executeBacklogOperation(root, { kind: 'list', search: '', status: '', offset: 0 })
    ).rejects.toThrow('Duplicate')
    await rm(path.join(root, 'backlog/tasks/ops-1 - sample.md'))
    await writeFile(
      path.join(root, 'backlog.config.yml'),
      'project_name: Sample\nbacklog_directory: backlog\nremote_operations: false\ncheck_active_branches: false\nnotes: |\n  auto_commit: true\n'
    )
    await expect(
      executeBacklogOperation(root, {
        kind: 'edit',
        id: 'OPS-01',
        title: 'Task',
        description: '',
        status: 'To Do'
      })
    ).rejects.toThrow('Disable Backlog autoCommit')
  })

  it('keeps shell and option syntax inside argv values', () => {
    const create = { kind: 'create', title: 'Task', description: '', status: 'Inbox' } as const
    const text = '--help; $(touch nope)\n%PATH% & `echo nope`'
    expect(
      backlogMutationArgs({ kind: 'create', title: text, description: text, status: 'In review' })
    ).toEqual([
      'task',
      'create',
      `--description=${text}`,
      '--status=In review',
      '--plain',
      '--',
      text
    ])
    expect(
      backlogMutationArgs({
        kind: 'edit',
        id: 'OPS-007.2',
        title: text,
        description: '',
        status: 'Inbox'
      })
    ).toEqual([
      'task',
      'edit',
      'OPS-007.2',
      `--title=${text}`,
      '--description=',
      '--status=Inbox',
      '--plain'
    ])
    expect(BacklogOperation.safeParse({ kind: 'read', id: '../OPS-1' }).success).toBe(false)
    expect(
      BacklogOperation.safeParse({ ...create, labels: ['a,b'] }).success,
      'the CLI would split a comma into two labels'
    ).toBe(false)
  })

  it('emits only changed fields, with replace-or-clear flags on edit', () => {
    const previous = {
      id: 'OPS-1',
      title: 'Task',
      description: '',
      status: 'Inbox',
      body: '',
      priority: 'low',
      type: 'bug',
      dueDate: '2026-11-05',
      parent: '',
      assignees: ['@a'],
      labels: ['work', 'repo:orca'],
      dependencies: ['OPS-2'],
      references: ['OPS-3'],
      documentation: []
    }
    const edit = {
      kind: 'edit',
      id: 'OPS-1',
      title: 'Task',
      description: '',
      status: 'Inbox'
    } as const
    expect(
      backlogMutationArgs(
        { ...edit, priority: 'Low', type: 'bug', labels: ['work', 'repo:orca'] },
        previous
      ),
      'unchanged, case aside'
    ).toEqual(['task', 'edit', 'OPS-1', '--plain'])
    expect(
      backlogMutationArgs(
        {
          ...edit,
          priority: 'High',
          type: '',
          dueDate: '',
          assignees: [],
          labels: ['work'],
          dependencies: [],
          references: ['https://example.com', 'OPS-4']
        },
        previous
      )
    ).toEqual([
      'task',
      'edit',
      'OPS-1',
      '--priority=High',
      '--type=',
      '--clear-due-date',
      '--assignee=',
      '--label=work',
      '--clear-deps',
      '--ref=https://example.com',
      '--ref=OPS-4',
      '--plain'
    ])
    expect(() => backlogMutationArgs({ ...edit, priority: '' }, previous)).toThrow(
      'cannot clear a priority'
    )
    expect(
      backlogMutationArgs({
        kind: 'create',
        title: 'New',
        description: '',
        status: 'Inbox',
        priority: '',
        type: 'bug',
        dueDate: '2026-12-01',
        assignees: ['@a'],
        labels: ['work', 'repo:orca'],
        dependencies: ['OPS-2'],
        references: []
      })
    ).toEqual([
      'task',
      'create',
      '--description=',
      '--status=Inbox',
      '--type=bug',
      '--due-date=2026-12-01',
      '--assignee=@a',
      '--labels=work',
      '--labels=repo:orca',
      '--dep=OPS-2',
      '--plain',
      '--',
      'New'
    ])
    expect(
      BacklogOperation.safeParse({
        kind: 'create',
        title: 'bad\0arg',
        description: '',
        status: 'Inbox'
      }).success
    ).toBe(false)
  })
})

// Set to an installed backlog.md package at BACKLOG_CLI_VERSION; all writes stay in the fixture copy.
it.skipIf(!process.env.ORCA_BACKLOG_TEST_PACKAGE)(
  'creates and edits through the real pinned CLI without losing other task sections',
  async () => {
    const source = process.env.ORCA_BACKLOG_TEST_PACKAGE!
    const root = await fixture()
    await mkdir(path.join(root, 'node_modules'), { recursive: true })
    await cp(source, path.join(root, 'node_modules/backlog.md'), {
      recursive: true,
      dereference: true
    })
    const nativePackage = `backlog.md-${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`
    await cp(
      path.join(path.dirname(source), nativePackage),
      path.join(root, 'node_modules', nativePackage),
      { recursive: true, dereference: true }
    )
    await task(root, 'TASK-001', 'Legacy')
    const legacyFile = path.join(root, 'backlog/tasks/task-001 - sample.md')
    await writeFile(
      legacyFile,
      (await readFile(legacyFile, 'utf8'))
        .replace('<!-- SECTION:DESCRIPTION:BEGIN -->\n', '')
        .replace('\n<!-- SECTION:DESCRIPTION:END -->', '')
    )
    const legacy = await executeBacklogOperation(root, { kind: 'read', id: 'TASK-001' })
    expect(legacy).toMatchObject({ description: 'Line one\nLine two' })
    if (!('body' in legacy)) {
      throw new Error('Expected task detail')
    }
    expect(backlogMutationArgs({ kind: 'edit', ...legacy, title: 'Title only' }, legacy)).toEqual([
      'task',
      'edit',
      'TASK-001',
      '--title=Title only',
      '--plain'
    ])
    await executeBacklogOperation(root, { kind: 'edit', ...legacy, title: 'Title only' })
    expect(await executeBacklogOperation(root, { kind: 'read', id: 'TASK-001' })).toMatchObject({
      description: 'Line one\nLine two',
      status: 'Legacy',
      body: expect.stringContaining('Preserve this')
    })
    await executeBacklogOperation(root, {
      kind: 'edit',
      ...legacy,
      title: 'Title only',
      description: 'Description only'
    })
    expect(await executeBacklogOperation(root, { kind: 'read', id: 'TASK-001' })).toMatchObject({
      title: 'Title only',
      description: 'Description only',
      status: 'Legacy',
      body: expect.stringContaining('Preserve this')
    })
    await executeBacklogOperation(root, {
      kind: 'edit',
      id: 'TASK-001',
      title: '--help; $(echo nope)',
      description: 'New\nparagraph',
      status: 'Released'
    })
    const edited = await executeBacklogOperation(root, { kind: 'read', id: 'TASK-001' })
    expect(edited).toMatchObject({
      title: '--help; $(echo nope)',
      description: 'New\nparagraph',
      status: 'Released',
      body: expect.stringContaining('Preserve this')
    })
    await executeBacklogOperation(root, {
      kind: 'create',
      title: '--literal title',
      description: 'Created by CLI',
      status: 'Inbox'
    })
    const list = await executeBacklogOperation(root, {
      kind: 'list',
      search: '--literal title',
      status: '',
      offset: 0
    })
    expect(list).toMatchObject({ total: 1, tasks: [{ title: '--literal title', status: 'Inbox' }] })
    const version = await runProcess({
      program: process.execPath,
      args: [path.join(root, 'node_modules/backlog.md/cli.js'), '--version'],
      cwd: root
    })
    expect(version.stdout.trim()).toBe(BACKLOG_CLI_VERSION)
    expect(await readFile(path.join(root, 'backlog.config.yml'), 'utf8')).toContain(
      'auto_commit: false'
    )
    // Fields and relations round-trip through the real CLI, without losing other sections.
    const created = await executeBacklogOperation(root, {
      kind: 'list',
      search: '--literal title',
      status: '',
      offset: 0
    })
    const prerequisite = 'tasks' in created ? created.tasks[0].id : ''
    const fields = {
      priority: 'low',
      type: 'bug',
      dueDate: '2026-11-05',
      assignees: ['@alice'],
      labels: ['work', 'repo:orca'],
      dependencies: [prerequisite],
      references: ['https://example.com/a', prerequisite]
    }
    if (!('body' in edited)) {
      throw new Error('Expected task detail')
    }
    const current = {
      kind: 'edit',
      id: edited.id,
      title: edited.title,
      description: edited.description,
      status: edited.status
    } as const
    await executeBacklogOperation(root, { ...current, ...fields })
    expect(await executeBacklogOperation(root, { kind: 'read', id: 'TASK-001' })).toMatchObject({
      ...fields,
      body: expect.stringContaining('Preserve this')
    })
    await executeBacklogOperation(root, { ...current, ...fields, dueDate: '', assignees: [] })
    expect(await executeBacklogOperation(root, { kind: 'read', id: 'TASK-001' })).toMatchObject({
      dueDate: '',
      assignees: []
    })
    // The CLI ran and failed, so the save is unconfirmed, never "not saved".
    const failed = await executeBacklogOperation(root, {
      ...current,
      dependencies: ['TASK-999']
    }).catch((caught: unknown) => caught)
    expect(failed).toBeInstanceOf(Error)
    expect(failed).not.toHaveProperty('code')
    expect(await executeBacklogOperation(root, { kind: 'read', id: prerequisite })).toMatchObject({
      blocks: ['TASK-001'],
      related: ['TASK-001']
    })
    // The CLI honours Orca's hold of its own per-task lock, so an agent's edit cannot interleave.
    const name = (await readdir(path.join(root, 'backlog/tasks'))).find((entry) =>
      entry.startsWith('task-001')
    )!
    await withBacklogTaskLock(
      path.join(root, 'backlog'),
      { id: 'TASK-001', filePath: path.join(root, 'backlog/tasks', name) },
      async () => {
        const agent = await runProcess({
          program: process.execPath,
          args: [
            path.join(root, 'node_modules/backlog.md/cli.js'),
            'task',
            'edit',
            'TASK-001',
            '--title=Agent',
            '--plain'
          ],
          cwd: root,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', CI: '1', NO_COLOR: '1' }
        })
        expect(agent.code).not.toBe(0)
        expect(`${agent.stdout}${agent.stderr}`).toContain('being modified by another process')
        // The CLI names its lock after the task it loaded, however the agent spelled the ID.
        const shortId = await runProcess({
          program: process.execPath,
          args: [
            path.join(root, 'node_modules/backlog.md/cli.js'),
            'task',
            'edit',
            '1',
            '--title=Agent',
            '--plain'
          ],
          cwd: root,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', CI: '1', NO_COLOR: '1' }
        })
        expect(`${shortId.stdout}${shortId.stderr}`).toContain('being modified by another process')
      }
    )
  }
)
