import { getBacklogStatusCategory, type BacklogTask } from '../../shared/backlog-types'

const DUE_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Most urgent first: open before done, then the earliest valid due date (undated last), then
 * the configured priority order (unknown last). The sort is stable, so ties keep the input order.
 */
export function sortBacklogTasks<T extends Pick<BacklogTask, 'status' | 'dueDate' | 'priority'>>(
  tasks: T[],
  project: { statuses: readonly string[]; priorities: readonly string[] }
): T[] {
  const priorities = project.priorities.map((entry) => entry.toLowerCase())
  const rank = (task: T) => {
    const priority = priorities.indexOf(task.priority.toLowerCase())
    const dated = DUE_DATE.test(task.dueDate)
    return {
      done: getBacklogStatusCategory(task.status, project.statuses) === 'done' ? 1 : 0,
      undated: dated ? 0 : 1,
      dueDate: dated ? task.dueDate : '',
      priority: priority === -1 ? priorities.length : priority
    }
  }
  const ranked = tasks.map((task) => ({ task, key: rank(task) }))
  ranked.sort(
    ({ key: a }, { key: b }) =>
      a.done - b.done ||
      a.undated - b.undated ||
      a.dueDate.localeCompare(b.dueDate) ||
      a.priority - b.priority
  )
  return ranked.map(({ task }) => task)
}
