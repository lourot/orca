import type { BacklogNewTaskSettings } from '../../../../shared/backlog-new-task-settings'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { DebouncedSettingsTextInput } from './DebouncedSettingsTextInput'
import { TaskSourceStepRow } from './TaskSourceStepRow'

type DefaultKey = keyof BacklogNewTaskSettings

/** Optional step: values prefilled in the New Backlog task dialog, editable there before saving. */
export function BacklogNewTaskDefaultsStep({
  index,
  settings,
  updateSettings
}: {
  index: number
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const field = (key: DefaultKey, label: string, placeholder: string): React.JSX.Element => (
    <div className="space-y-1">
      <Label htmlFor={`settings-${key}`} variant="settings">
        {label}
      </Label>
      <DebouncedSettingsTextInput
        id={`settings-${key}`}
        type="text"
        value={settings[key] ?? ''}
        commit={(next) => updateSettings({ [key]: next })}
        placeholder={placeholder}
        spellCheck={false}
      />
    </div>
  )
  const configured = Boolean(
    settings.backlogNewTaskPriority ||
    settings.backlogNewTaskAssignees ||
    settings.backlogNewTaskLabels
  )
  return (
    <TaskSourceStepRow
      index={index}
      state={configured ? 'done' : 'pending'}
      title={translate('backlog.newTaskDefaultsTitle', 'New task defaults')}
      description={translate(
        'backlog.newTaskDefaultsDescription',
        'Optional. Prefilled when you create a task, in every project; you can still change them before saving.'
      )}
    >
      <div className="grid gap-2 pt-1 sm:grid-cols-3">
        {field(
          'backlogNewTaskPriority',
          translate('backlog.priority', 'Priority'),
          translate('backlog.priorityHint', 'e.g. low')
        )}
        {field(
          'backlogNewTaskAssignees',
          translate('backlog.assignees', 'Assignees'),
          translate('backlog.assigneesHint', '@name, @other')
        )}
        {field(
          'backlogNewTaskLabels',
          translate('backlog.labels', 'Labels'),
          translate('backlog.labelsHint', 'Comma-separated, e.g. work, repo:orca')
        )}
      </div>
    </TaskSourceStepRow>
  )
}
