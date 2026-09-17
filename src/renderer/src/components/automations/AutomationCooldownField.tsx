import { Info } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AUTOMATION_EDITOR_SECTION_LABEL_CLASS, Field } from './automation-page-parts'
import type { AutomationDraft } from './AutomationEditorDialog'
import { translate } from '@/i18n/i18n'

type AutomationCooldownFieldProps = {
  draft: AutomationDraft
  disabled: boolean
  pickerTriggerClassName: string
  onDraftChange: (updater: (current: AutomationDraft) => AutomationDraft) => void
}

export function AutomationCooldownField({
  draft,
  disabled,
  pickerTriggerClassName,
  onDraftChange
}: AutomationCooldownFieldProps): React.JSX.Element {
  return (
    <Field
      labelClassName={AUTOMATION_EDITOR_SECTION_LABEL_CLASS}
      label={
        <span className="inline-flex items-center gap-1">
          {translate('auto.components.automations.AutomationCooldownField.64d2d43b2e', 'Cooldown')}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={translate(
                  'auto.components.automations.AutomationCooldownField.ec15594db0',
                  'Run cooldown help'
                )}
                className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} className="max-w-72">
              {translate(
                'auto.components.automations.AutomationCooldownField.b63f9c88b2',
                'Skips a scheduled run when this automation already started one within the window. Manual runs ignore it.'
              )}
            </TooltipContent>
          </Tooltip>
        </span>
      }
    >
      <Select
        value={draft.minMinutesSinceLastRun}
        disabled={disabled}
        onValueChange={(minMinutesSinceLastRun) =>
          onDraftChange((current) => ({ ...current, minMinutesSinceLastRun }))
        }
      >
        <SelectTrigger className={`w-full ${pickerTriggerClassName}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" side="bottom" align="start" sideOffset={4}>
          <SelectItem value="0">
            {translate(
              'auto.components.automations.AutomationCooldownField.fefec60705',
              'No cooldown'
            )}
          </SelectItem>
          <SelectItem value="30">
            {translate(
              'auto.components.automations.AutomationCooldownField.f35ec1df75',
              '30 minutes'
            )}
          </SelectItem>
          <SelectItem value="60">
            {translate('auto.components.automations.AutomationCooldownField.17efb5d92c', '1 hour')}
          </SelectItem>
          <SelectItem value="180">
            {translate('auto.components.automations.AutomationCooldownField.bdb5654071', '3 hours')}
          </SelectItem>
          <SelectItem value="720">
            {translate(
              'auto.components.automations.AutomationCooldownField.d0f5ada630',
              '12 hours'
            )}
          </SelectItem>
          <SelectItem value="960">
            {translate(
              'auto.components.automations.AutomationCooldownField.74d5a976fa',
              '16 hours'
            )}
          </SelectItem>
          <SelectItem value="1200">
            {translate(
              'auto.components.automations.AutomationCooldownField.c160789c45',
              '20 hours'
            )}
          </SelectItem>
          <SelectItem value="1440">
            {translate(
              'auto.components.automations.AutomationCooldownField.247d06bf28',
              '24 hours'
            )}
          </SelectItem>
        </SelectContent>
      </Select>
    </Field>
  )
}
