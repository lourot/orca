import { translate } from '@/i18n/i18n'
import type { BacklogTask } from '../../../../../shared/backlog-types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

// Radix Select reserves '' for "no value", so an unset field uses this item value.
const NONE = '__none__'

/** Editor text for the fields beyond title/description/status; lists are comma or line separated. */
export type BacklogFieldDraft = {
  priority: string
  type: string
  dueDate: string
  assignees: string
  labels: string
  dependencies: string
  references: string
}

/** The operation's field values; a field left out is not changed. */
export type BacklogFieldEdits = Partial<{
  priority: string
  type: string
  dueDate: string
  assignees: string[]
  labels: string[]
  dependencies: string[]
  references: string[]
}>

/** Seeds the editor from a task, or empty for a new one. */
export function backlogFieldDraft(task: BacklogTask | null): BacklogFieldDraft {
  return {
    priority: task?.priority ?? '',
    type: task?.type ?? '',
    dueDate: task?.dueDate ?? '',
    assignees: task?.assignees.join(', ') ?? '',
    labels: task?.labels.join(', ') ?? '',
    dependencies: task?.dependencies.join(', ') ?? '',
    references: task?.references.join('\n') ?? ''
  }
}

/**
 * Turns the editor text into field values, keeping only fields edited since `loaded`, so a stored
 * value the edit schema would reject (a hand-written date, a comma in a URL) never blocks saving
 * other fields.
 */
export function backlogFieldEdits(
  draft: BacklogFieldDraft,
  loaded: BacklogFieldDraft
): BacklogFieldEdits {
  const split = (text: string, separator: RegExp): string[] =>
    text
      .split(separator)
      .map((value) => value.trim())
      .filter(Boolean)
  const changed = (key: keyof BacklogFieldDraft): boolean => draft[key] !== loaded[key]
  return {
    ...(changed('priority') ? { priority: draft.priority } : {}),
    ...(changed('type') ? { type: draft.type } : {}),
    ...(changed('dueDate') ? { dueDate: draft.dueDate } : {}),
    ...(changed('assignees') ? { assignees: split(draft.assignees, /,/) } : {}),
    ...(changed('labels') ? { labels: split(draft.labels, /,/) } : {}),
    ...(changed('dependencies') ? { dependencies: split(draft.dependencies, /,/) } : {}),
    ...(changed('references') ? { references: split(draft.references, /\r?\n/) } : {})
  }
}

/** Picks the configured spelling of a stored value (the CLI stores `low` for `Low`). */
function configured(value: string, options: string[]): string {
  return options.find((option) => option.toLowerCase() === value.toLowerCase()) ?? value
}

/**
 * Inputs for priority, type, due date, people, labels and relations. `priorityClearable` is true
 * when the loaded task has no priority, so choosing None leaves it unset.
 */
export function BacklogTaskFieldInputs({
  draft,
  priorityClearable,
  priorities,
  types,
  disabled,
  onChange
}: {
  draft: BacklogFieldDraft
  priorityClearable: boolean
  priorities: string[]
  types: string[]
  disabled: boolean
  onChange: (draft: BacklogFieldDraft) => void
}): React.JSX.Element {
  const set = (key: keyof BacklogFieldDraft) => (value: string) =>
    onChange({ ...draft, [key]: value })
  /** A value missing from the config stays selectable, so saving other fields keeps it. */
  const choices = (value: string, options: string[]): string[] =>
    value && !options.some((option) => option.toLowerCase() === value.toLowerCase())
      ? [value, ...options]
      : options
  const text = (
    key: 'assignees' | 'labels' | 'dependencies',
    label: string,
    placeholder: string
  ): React.JSX.Element => (
    <div className="space-y-1">
      <Label htmlFor={`backlog-${key}`}>{label}</Label>
      <Input
        id={`backlog-${key}`}
        value={draft[key]}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => set(key)(event.target.value)}
      />
    </div>
  )
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label>{translate('backlog.priority', 'Priority')}</Label>
          <Select
            value={draft.priority ? configured(draft.priority, priorities) : NONE}
            onValueChange={(value) => set('priority')(value === NONE ? '' : value)}
            disabled={disabled}
          >
            <SelectTrigger aria-label={translate('backlog.taskPriority', 'Task priority')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Backlog.md cannot clear a priority, so "None" exists only while none is stored. */}
              {priorityClearable ? (
                <SelectItem value={NONE}>{translate('backlog.none', 'None')}</SelectItem>
              ) : null}
              {choices(draft.priority, priorities).map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {entry}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{translate('backlog.type', 'Type')}</Label>
          <Select
            value={draft.type ? configured(draft.type, types) : NONE}
            onValueChange={(value) => set('type')(value === NONE ? '' : value)}
            disabled={disabled}
          >
            <SelectTrigger aria-label={translate('backlog.taskType', 'Task type')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{translate('backlog.none', 'None')}</SelectItem>
              {choices(draft.type, types).map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {entry}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="backlog-due-date">{translate('backlog.dueDate', 'Due date')}</Label>
          <Input
            id="backlog-due-date"
            type="date"
            value={draft.dueDate}
            disabled={disabled}
            onChange={(event) => set('dueDate')(event.target.value)}
          />
        </div>
      </div>
      {text(
        'assignees',
        translate('backlog.assignees', 'Assignees'),
        translate('backlog.assigneesHint', '@name, @other')
      )}
      {text(
        'labels',
        translate('backlog.labels', 'Labels'),
        translate('backlog.labelsHint', 'Comma-separated, e.g. work, repo:orca')
      )}
      {text(
        'dependencies',
        translate('backlog.dependsOn', 'Depends on'),
        translate('backlog.dependsOnHint', 'Task IDs this one waits on, e.g. TASK-1, TASK-2')
      )}
      <div className="space-y-1">
        <Label htmlFor="backlog-references">{translate('backlog.references', 'References')}</Label>
        <Textarea
          id="backlog-references"
          value={draft.references}
          placeholder={translate(
            'backlog.referencesHint',
            'One per line: a URL, a file path, or a task ID to mark it related'
          )}
          disabled={disabled}
          onChange={(event) => set('references')(event.target.value)}
        />
      </div>
    </>
  )
}
