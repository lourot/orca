import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  getBacklogStatusCategory,
  type BacklogTaskSummary
} from '../../../../../shared/backlog-types'
import { getJiraPriorityTone, getJiraStatusTone } from '../jira/task-page-jira-status-tone'
import { TaskBlockedBy } from '../task-blocked-by'
import { TaskDueDate } from '../task-due-date-label'
import { TaskTypeIcon } from '../task-type-icon'

/** A status pill coloured by its place in the workflow: grey to do, blue in progress, green done. */
export function BacklogStatusPill({
  status,
  statuses
}: {
  status: string
  statuses: readonly string[]
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium',
        getJiraStatusTone(getBacklogStatusCategory(status, statuses))
      )}
    >
      {status}
    </span>
  )
}

/** A priority name in the High/Medium/Low tones the Jira list uses. */
export function BacklogPriorityText({ priority }: { priority: string }): React.JSX.Element | null {
  return priority ? (
    <span className={cn('shrink-0 text-xs font-medium', getJiraPriorityTone(priority))}>
      {priority}
    </span>
  ) : null
}

/**
 * One task in the list: type, ID, title, status, priority, due date, labels, then the open
 * blockers. The blockers sit beside the row's button, since a button can't hold buttons.
 */
export function BacklogTaskRow({
  task,
  statuses,
  disabled,
  onOpen,
  onOpenTask
}: {
  task: BacklogTaskSummary
  statuses: readonly string[]
  disabled: boolean
  onOpen: () => void
  onOpenTask: (id: string) => void
}): React.JSX.Element {
  const done = getBacklogStatusCategory(task.status, statuses) === 'done'
  return (
    <div className="flex w-full min-w-0 items-center gap-1">
      <Button
        variant="ghost"
        className="min-w-0 flex-1 justify-start"
        disabled={disabled}
        onClick={onOpen}
      >
        <TaskTypeIcon type={task.type} />
        <span className={cn('font-mono', done && 'text-muted-foreground')}>{task.id}</span>
        <span className={cn('truncate', done && 'text-muted-foreground')}>{task.title}</span>
        <BacklogStatusPill status={task.status} statuses={statuses} />
        <BacklogPriorityText priority={task.priority} />
        <TaskDueDate dueDate={task.dueDate} done={done} className="text-xs" />
        {[...new Set(task.labels)].map((label) => (
          <Badge key={label} variant="outline">
            {label}
          </Badge>
        ))}
      </Button>
      <TaskBlockedBy
        ids={task.blockedBy}
        onOpen={disabled ? undefined : onOpenTask}
        className="shrink-0 text-xs"
      />
    </div>
  )
}
