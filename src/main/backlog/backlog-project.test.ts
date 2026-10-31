import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadBacklogProject } from './backlog-project'
import { parseBacklogTask } from './backlog-task-file'
import { backlogMutationUnavailable } from './backlog-cli'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

it.each([
  'onStatusChange : echo blocked',
  'on_status_change : echo blocked',
  'remote_operations : true',
  'check_active_branches : true',
  'auto_commit : true',
  'backlog_directory : elsewhere',
  'project_name : Hidden'
])('refuses CLI effects hidden in a YAML literal: %s', async (line) => {
  const root = await mkdtemp(path.join(tmpdir(), 'orca-backlog-config-'))
  roots.push(root)
  await mkdir(path.join(root, 'backlog'))
  await writeFile(
    path.join(root, 'backlog.config.yml'),
    `project_name: Safe\nbacklog_directory: backlog\nremote_operations: false\ncheck_active_branches: false\nnotes: |\n  ${line}\n`
  )
  expect(backlogMutationUnavailable(await loadBacklogProject(root))).not.toBeNull()
})

it('refuses quoted network keys that the CLI ignores', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'orca-backlog-config-'))
  roots.push(root)
  await mkdir(path.join(root, 'backlog'))
  await writeFile(
    path.join(root, 'backlog.config.yml'),
    'project_name: Safe\nbacklog_directory: backlog\n"remote_operations": false\n"check_active_branches": false\n'
  )
  expect(backlogMutationUnavailable(await loadBacklogProject(root))).not.toBeNull()
})

it.each([
  "'onStatusChange': echo blocked",
  'onStatusChange : echo blocked',
  '"onStatusChange": echo blocked',
  'defaults: &hook\n  onStatusChange: echo blocked\n<<: *hook'
])('detects hooks in complete YAML metadata: %s', (field) => {
  expect(
    parseBacklogTask(`---\nid: TASK-1\ntitle: Safe\nstatus: Inbox\n${field}\n---\n`).hasStatusHook
  ).toBe(true)
})

it.each(['\n', '\r\n'])(
  'preserves multiline legacy descriptions with %j line endings',
  (newline) => {
    const content =
      '---\nid: TASK-1\ntitle: Safe\nstatus: Inbox\n---\n## Description\nFirst line\nSecond line\n\nAnother paragraph\n\n## Acceptance Criteria\n- [ ] Keep'.replaceAll(
        '\n',
        newline
      )
    expect(parseBacklogTask(content).description).toBe(
      ['First line', 'Second line', '', 'Another paragraph'].join(newline)
    )
    expect(parseBacklogTask(content.split(`${newline}## Acceptance Criteria`)[0]).description).toBe(
      ['First line', 'Second line', '', 'Another paragraph'].join(newline)
    )
  }
)

it.each([
  ['123', '123'],
  ['0', ''],
  ['true', 'true'],
  ['false', ''],
  ['yes', 'yes'],
  ['no', 'no'],
  ['on', 'on'],
  ['off', 'off'],
  ['0123', '83'],
  ['null', ''],
  ['', ''],
  ['2026-01-02', String(new Date('2026-01-02'))]
])('accepts CLI scalar title %j', (title, expected) => {
  expect(parseBacklogTask(`---\nid: TASK-1\ntitle: ${title}\nstatus: Inbox\n---\n`).title).toBe(
    expected
  )
})

it.each(['{ bad: object }', '[bad, array]'])('rejects non-scalar title %s', (title) => {
  expect(() => parseBacklogTask(`---\nid: TASK-1\ntitle: ${title}\nstatus: Inbox\n---\n`)).toThrow()
})

it.each(['assignee', 'reporter'])(
  'accepts unquoted handles in %s without hiding hooks',
  (field) => {
    for (const value of ['@sara', '[@sara]', '[@sara, "other, person", @lee]']) {
      for (const hook of [
        '',
        "'onStatusChange': echo blocked",
        'onStatusChange : echo blocked',
        'defaults: &hook\n  assignee: @sara\n  onStatusChange: echo blocked\n<<: *hook'
      ]) {
        const task = parseBacklogTask(
          `---\nid: TASK-1\ntitle: Safe\nstatus: Inbox\n${field}: ${value}\n${hook}\n---\n`
        )
        expect(task.title).toBe('Safe')
        expect(task.hasStatusHook).toBe(Boolean(hook))
      }
    }
  }
)

it.each(['title: @bad', 'onStatusChange: @bad', 'assignee: [@sara', 'reporter: `bad'])(
  'does not suppress unrelated YAML errors: %s',
  (field) => {
    expect(() => parseBacklogTask(`---\nid: TASK-1\nstatus: Inbox\n${field}\n---\n`)).toThrow()
  }
)

it('reads every display field, leniently, as the CLI writes them', () => {
  const parse = (fields: string) =>
    parseBacklogTask(`---\nid: TASK-2\ntitle: Safe\nstatus: Inbox\n${fields}\n---\n`)
  expect(
    parse(
      [
        'assignee:\n  - "@alice"',
        "due_date: '2026-11-05'",
        'labels:\n  - work\n  - repo:orca',
        'dependencies:\n  - TASK-1',
        'references:\n  - https://example.com/a\n  - TASK-3',
        'documentation:\n  - /abs/note.md',
        'parent_task_id: TASK-1',
        'priority: low',
        'type: bug'
      ].join('\n')
    )
  ).toMatchObject({
    assignees: ['@alice'],
    dueDate: '2026-11-05',
    labels: ['work', 'repo:orca'],
    dependencies: ['TASK-1'],
    references: ['https://example.com/a', 'TASK-3'],
    documentation: ['/abs/note.md'],
    parent: 'TASK-1',
    priority: 'low',
    type: 'bug'
  })
  // An unquoted date parses as a YAML Date; a scalar list and junk degrade instead of throwing.
  expect(
    parse('due_date: 2026-11-05\nlabels: work\ndependencies: { bad: map }\npriority: [x]')
  ).toMatchObject({ dueDate: '2026-11-05', labels: ['work'], dependencies: [], priority: '' })
  expect(parse('')).toMatchObject({ labels: [], priority: '', dueDate: '', parent: '' })
})
