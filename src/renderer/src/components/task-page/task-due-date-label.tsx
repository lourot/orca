import { CalendarClock } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { formatTaskDueDate, isTaskOverdue } from './task-due-date'

/** A task's due date, in the destructive tone once it has passed on an open task. */
export function TaskDueDate({
  dueDate,
  done,
  className
}: {
  dueDate: string
  done: boolean
  className?: string
}): React.JSX.Element | null {
  if (!dueDate) {
    return null
  }
  const date = formatTaskDueDate(dueDate)
  const overdue = isTaskOverdue(dueDate, done)
  const label = overdue
    ? translate('taskProviders.overdue', 'Overdue, due {{date}}', { date })
    : translate('taskProviders.dueDate', 'Due {{date}}', { date })
  return (
    <span
      className={cn('flex shrink-0 items-center gap-0.5', overdue && 'text-destructive', className)}
      title={label}
      aria-label={label}
    >
      <CalendarClock className="size-3" aria-hidden />
      {date}
    </span>
  )
}
