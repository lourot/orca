import { translate } from '@/i18n/i18n'
import {
  BACKLOG_TASK_ID_PATTERN,
  backlogTaskKey,
  getBacklogStatusCategory,
  type BacklogTaskDetail
} from '../../../../../shared/backlog-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TaskDueDate } from '../task-due-date-label'
import { TaskTypeIcon } from '../task-type-icon'
import { BacklogPriorityText, BacklogStatusPill } from './BacklogTaskRow'

/** One labelled row; rows without a value are not rendered. */
function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-1 text-sm">{children}</dd>
    </>
  )
}

/** Shows a task's frontmatter fields and its relations; linked tasks open in place. */
export function BacklogTaskFields({
  task,
  statuses,
  onOpenTask
}: {
  task: BacklogTaskDetail
  statuses: readonly string[]
  onOpenTask: (id: string) => void
}): React.JSX.Element | null {
  const links = new Map(task.links.map((link) => [backlogTaskKey(link.id), link]))
  const relatedIds = new Set(task.related.map(backlogTaskKey))
  const references = task.references.filter(
    (reference) =>
      !(BACKLOG_TASK_ID_PATTERN.test(reference) && relatedIds.has(backlogTaskKey(reference)))
  )
  /** A linked task the board knows opens in place; an unknown ID (archived, typo) is plain text. */
  const taskLinks = (ids: string[]): React.ReactNode =>
    [...new Set(ids)].map((id) => {
      const link = links.get(backlogTaskKey(id))
      return link ? (
        <Button
          key={id}
          variant="ghost"
          size="xs"
          className="max-w-full justify-start"
          onClick={() => onOpenTask(link.id)}
        >
          <span className="font-mono">{link.id}</span>
          <span className="truncate">{link.title}</span>
          <BacklogStatusPill status={link.status} statuses={statuses} />
        </Button>
      ) : (
        <span key={id} className="font-mono text-muted-foreground">
          {id}
        </span>
      )
    })
  /** URLs open in the system browser; paths and other text stay copyable text. */
  const pointers = (values: string[]): React.ReactNode =>
    [...new Set(values)].map((value) =>
      /^https?:\/\//i.test(value) ? (
        <Button
          key={value}
          variant="link"
          size="xs"
          className="max-w-full"
          onClick={() => void window.api.shell.openUrl(value)}
        >
          <span className="truncate">{value}</span>
        </Button>
      ) : (
        <span key={value} className="break-all font-mono text-xs">
          {value}
        </span>
      )
    )
  const rows: [string, React.ReactNode][] = [
    [
      translate('backlog.priority', 'Priority'),
      task.priority ? <BacklogPriorityText key="priority" priority={task.priority} /> : null
    ],
    [
      translate('backlog.type', 'Type'),
      task.type ? (
        <>
          <TaskTypeIcon type={task.type} />
          {task.type}
        </>
      ) : null
    ],
    [translate('backlog.assignees', 'Assignees'), task.assignees.join(', ')],
    [
      translate('backlog.labels', 'Labels'),
      task.labels.length
        ? [...new Set(task.labels)].map((label) => (
            <Badge key={label} variant="secondary">
              {label}
            </Badge>
          ))
        : null
    ],
    [
      translate('backlog.dueDate', 'Due date'),
      task.dueDate ? (
        <TaskDueDate
          key="dueDate"
          dueDate={task.dueDate}
          done={getBacklogStatusCategory(task.status, statuses) === 'done'}
        />
      ) : null
    ],
    [translate('backlog.parent', 'Parent'), task.parent ? taskLinks([task.parent]) : null],
    [translate('backlog.dependsOn', 'Depends on'), taskLinks(task.dependencies)],
    [translate('backlog.blocks', 'Blocks'), taskLinks(task.blocks)],
    [translate('backlog.subtasks', 'Subtasks'), taskLinks(task.subtasks)],
    [translate('backlog.related', 'Related'), taskLinks(task.related)],
    [translate('backlog.references', 'References'), pointers(references)],
    [translate('backlog.documentation', 'Documentation'), pointers(task.documentation)]
  ]
  const shown = rows.filter(([, value]) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value)
  )
  if (!shown.length) {
    return null
  }
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1">
      {shown.map(([label, value]) => (
        <Row key={label} label={label}>
          {value}
        </Row>
      ))}
    </dl>
  )
}
