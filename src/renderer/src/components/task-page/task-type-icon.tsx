import {
  Bookmark,
  Bug,
  CircleDot,
  FileText,
  FlaskConical,
  ListTree,
  Siren,
  Sparkles,
  SquareCheck,
  Wrench,
  Zap,
  type LucideIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const MUTED = 'text-muted-foreground'

const TYPES: Record<string, [LucideIcon, string]> = {
  bug: [Bug, 'text-destructive'],
  defect: [Bug, 'text-destructive'],
  incident: [Siren, 'text-destructive'],
  story: [Bookmark, 'text-status-success'],
  'user story': [Bookmark, 'text-status-success'],
  feature: [Bookmark, 'text-status-success'],
  task: [SquareCheck, 'text-callout-note'],
  'sub-task': [ListTree, 'text-callout-note'],
  subtask: [ListTree, 'text-callout-note'],
  epic: [Zap, 'text-callout-important'],
  improvement: [Sparkles, 'text-status-warning'],
  enhancement: [Sparkles, 'text-status-warning'],
  spike: [FlaskConical, 'text-status-warning'],
  research: [FlaskConical, 'text-status-warning'],
  chore: [Wrench, MUTED],
  docs: [FileText, MUTED],
  documentation: [FileText, MUTED]
}

/** A coloured icon for an issue type name (Jira issue type, Backlog.md type), named on hover; nothing when empty. */
export function TaskTypeIcon({
  type,
  className
}: {
  type: string | undefined
  className?: string
}): React.JSX.Element | null {
  if (!type) {
    return null
  }
  const [Icon, tone] = TYPES[type.trim().toLowerCase()] ?? [CircleDot, MUTED]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" aria-label={type} className="inline-flex shrink-0">
          <Icon className={cn('size-3.5', tone, className)} aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {type}
      </TooltipContent>
    </Tooltip>
  )
}
