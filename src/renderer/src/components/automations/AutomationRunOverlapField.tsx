import { Info } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AUTOMATION_EDITOR_SECTION_LABEL_CLASS, Field } from './automation-page-parts'
import type { AutomationDraft } from './AutomationEditorDialog'
import { translate } from '@/i18n/i18n'

type AutomationRunOverlapFieldProps = {
  draft: AutomationDraft
  toggleGroupClassName: string
  toggleItemClassName: string
  onDraftChange: (updater: (current: AutomationDraft) => AutomationDraft) => void
}

export function AutomationRunOverlapField({
  draft,
  toggleGroupClassName,
  toggleItemClassName,
  onDraftChange
}: AutomationRunOverlapFieldProps): React.JSX.Element {
  return (
    <Field
      labelClassName={AUTOMATION_EDITOR_SECTION_LABEL_CLASS}
      label={
        <span className="inline-flex items-center gap-1">
          {translate('auto.components.automations.AutomationRunOverlapField.ec134960b6', 'Overlap')}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={translate(
                  'auto.components.automations.AutomationRunOverlapField.58167e9b76',
                  'Overlapping runs help'
                )}
                className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} className="max-w-72">
              {translate(
                'auto.components.automations.AutomationRunOverlapField.6161c86175',
                'Skips a scheduled run while a previous run of this automation is still going, so two agents never share one workspace. Manual runs are blocked too.'
              )}
            </TooltipContent>
          </Tooltip>
        </span>
      }
    >
      <ToggleGroup
        type="single"
        spacing={1}
        value={draft.skipWhileRunActive ? 'skip' : 'allow'}
        onValueChange={(value) => {
          if (!value) {
            return
          }
          onDraftChange((current) => ({ ...current, skipWhileRunActive: value === 'skip' }))
        }}
        size="sm"
        className={toggleGroupClassName}
      >
        <ToggleGroupItem value="skip" className={toggleItemClassName}>
          {translate('auto.components.automations.AutomationRunOverlapField.9b9fa9e30f', 'Skip')}
        </ToggleGroupItem>
        <ToggleGroupItem value="allow" className={toggleItemClassName}>
          {translate('auto.components.automations.AutomationRunOverlapField.3c0ba07648', 'Allow')}
        </ToggleGroupItem>
      </ToggleGroup>
    </Field>
  )
}
