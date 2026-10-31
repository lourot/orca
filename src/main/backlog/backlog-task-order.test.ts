import { describe, expect, it } from 'vitest'
import { getBacklogStatusCategory } from '../../shared/backlog-types'
import { sortBacklogTasks } from './backlog-task-order'

const project = {
  statuses: ['To Do', 'In Progress', 'Done'],
  priorities: ['High', 'Medium', 'Low']
}

describe('sortBacklogTasks', () => {
  it('puts open tasks first, then earliest due date, then priority, keeping ties in order', () => {
    const task = (id: string, status: string, dueDate: string, priority: string) => ({
      id,
      status,
      dueDate,
      priority
    })
    const sorted = sortBacklogTasks(
      [
        task('done-overdue', 'Done', '2026-01-01', 'high'),
        task('undated-high', 'To Do', '', 'high'),
        task('late-low', 'To Do', '2026-12-01', 'low'),
        task('soon-low', 'In Progress', '2026-11-02', 'low'),
        task('soon-high', 'To Do', '2026-11-02', 'High'),
        task('undated-none', 'To Do', '', ''),
        task('undated-unknown', 'To Do', '', 'urgent'),
        task('bad-date-high', 'To Do', 'next week', 'high'),
        task('undated-low', 'to do', '', 'low')
      ],
      project
    )
    expect(sorted.map(({ id }) => id)).toEqual([
      'soon-high',
      'soon-low',
      'late-low',
      'undated-high',
      'bad-date-high',
      'undated-low',
      'undated-none',
      'undated-unknown',
      'done-overdue'
    ])
  })

  it('categorizes statuses by their place in the configured workflow', () => {
    const statuses = ['Backlog', 'Ready', 'In Review', 'Shipped']
    expect(
      ['Backlog', 'ready', 'In Review', 'shipped', 'Unknown'].map((status) =>
        getBacklogStatusCategory(status, statuses)
      )
    ).toEqual(['new', 'indeterminate', 'indeterminate', 'done', 'new'])
  })
})
