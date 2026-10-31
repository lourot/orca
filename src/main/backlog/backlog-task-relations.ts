import {
  backlogTaskKey,
  type BacklogTask,
  type BacklogTaskDetail
} from '../../shared/backlog-types'

/**
 * Adds the relations Backlog.md stores on the other side: tasks this one blocks (their
 * dependencies name it), its subtasks, and tasks related by a task-ID reference in either
 * direction. `links` gives every task the detail names, for titles and statuses.
 */
export function describeBacklogTask(task: BacklogTask, tasks: BacklogTask[]): BacklogTaskDetail {
  const byKey = new Map(tasks.map((candidate) => [backlogTaskKey(candidate.id), candidate]))
  const self = backlogTaskKey(task.id)
  const others = tasks.filter((candidate) => backlogTaskKey(candidate.id) !== self)
  const naming = (ids: string[]): boolean => ids.some((id) => backlogTaskKey(id) === self)
  const blocks = others.filter((candidate) => naming(candidate.dependencies)).map(({ id }) => id)
  const subtasks = others.filter((candidate) => naming([candidate.parent])).map(({ id }) => id)
  // A reference that names an existing task is a "related" link; one side is enough.
  const related = [
    ...task.references.flatMap((reference) => {
      const target = byKey.get(backlogTaskKey(reference))
      return target && backlogTaskKey(target.id) !== self ? [target.id] : []
    }),
    ...others.filter((candidate) => naming(candidate.references)).map(({ id }) => id)
  ].filter(
    (id, index, all) =>
      all.findIndex((other) => backlogTaskKey(other) === backlogTaskKey(id)) === index
  )
  const named = [task.parent, ...task.dependencies, ...blocks, ...subtasks, ...related]
  const links = named.flatMap((id) => {
    const target = id ? byKey.get(backlogTaskKey(id)) : undefined
    return target ? [{ id: target.id, title: target.title, status: target.status }] : []
  })
  return {
    ...task,
    blocks,
    subtasks,
    related,
    links: links.filter((link, index) => links.findIndex((other) => other.id === link.id) === index)
  }
}
