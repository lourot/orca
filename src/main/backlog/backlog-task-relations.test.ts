import { expect, it } from 'vitest'
import type { BacklogTask } from '../../shared/backlog-types'
import { describeBacklogTask } from './backlog-task-relations'

/** A task with every field empty but the ones given. */
function task(id: string, fields: Partial<BacklogTask> = {}): BacklogTask {
  return {
    id,
    title: `Title ${id}`,
    status: 'To Do',
    description: '',
    body: '',
    priority: '',
    type: '',
    dueDate: '',
    parent: '',
    assignees: [],
    labels: [],
    dependencies: [],
    references: [],
    documentation: [],
    ...fields
  }
}

it('derives blocks, subtasks and related links from the other side of each relation', () => {
  const tasks = [
    task('TASK-1', { references: ['TASK-4', 'https://example.com'] }),
    task('TASK-2', { dependencies: ['TASK-1'] }),
    task('TASK-3', { parent: 'task-01' }),
    task('TASK-4'),
    task('TASK-5', { references: ['TASK-1'] }),
    task('TASK-6', { dependencies: ['TASK-9'] })
  ]
  const { blocks, subtasks, related, links } = describeBacklogTask(tasks[0], tasks)
  expect({ blocks, subtasks, related }).toEqual({
    blocks: ['TASK-2'],
    subtasks: ['TASK-3'],
    related: ['TASK-4', 'TASK-5']
  })
  expect(links.map(({ id }) => id).sort()).toEqual(['TASK-2', 'TASK-3', 'TASK-4', 'TASK-5'])
  // The waiting side sees "depends on", never "blocks".
  expect(describeBacklogTask(tasks[1], tasks)).toMatchObject({
    dependencies: ['TASK-1'],
    blocks: [],
    links: [{ id: 'TASK-1', title: 'Title TASK-1', status: 'To Do' }]
  })
})
