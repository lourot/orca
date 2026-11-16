import { Info } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AUTOMATION_EDITOR_SECTION_LABEL_CLASS, Field } from './automation-page-parts'
import type { AutomationDraft } from './AutomationEditorDialog'
import { translate } from '@/i18n/i18n'

type SessionChoice = 'fresh' | 'reuse' | 'skip'

function sessionChoice(draft: AutomationDraft): SessionChoice {
  if (draft.workspaceMode === 'existing' && draft.reuseSession) {
    return 'reuse'
  }
  return draft.skipWhileSessionOpen ? 'skip' : 'fresh'
}

function isSessionChoice(value: string): value is SessionChoice {
  return value === 'fresh' || value === 'reuse' || value === 'skip'
}

type AutomationSessionFieldProps = {
  draft: AutomationDraft
  toggleGroupClassName: string
  toggleItemClassName: string
  onDraftChange: (updater: (current: AutomationDraft) => AutomationDraft) => void
}

export function AutomationSessionField({
  draft,
  toggleGroupClassName,
  toggleItemClassName,
  onDraftChange
}: AutomationSessionFieldProps): React.JSX.Element {
  return (
    <Field
      labelClassName={AUTOMATION_EDITOR_SECTION_LABEL_CLASS}
      label={
        <span className="inline-flex items-center gap-1">
          {translate('auto.components.automations.AutomationSessionField.5ad314118e', 'Session')}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={translate(
                  'auto.components.automations.AutomationSessionField.4bdce31f37',
                  'Session reuse help'
                )}
                className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} className="max-w-72">
              <p>
                {translate(
                  'auto.components.automations.AutomationSessionField.b675112193',
                  'Reuse sends future runs to the previous live automation session. If that session is gone, Orca starts a fresh one.'
                )}
              </p>
              <p className="mt-1">
                {translate(
                  'auto.components.automations.AutomationSessionField.skipIfOpenHelp',
                  "Skip if open skips a run while this automation's previous session is still open, including Run now. Once it is closed, the next run starts a fresh one."
                )}
              </p>
              <p className="mt-1">
                {translate(
                  'auto.components.automations.AutomationSessionField.closeWhenDoneHelp',
                  'Reuse and Skip if open always leave the session open when a run finishes.'
                )}
              </p>
            </TooltipContent>
          </Tooltip>
        </span>
      }
    >
      <ToggleGroup
        type="single"
        spacing={1}
        value={sessionChoice(draft)}
        onValueChange={(value) => {
          if (!isSessionChoice(value)) {
            return
          }
          onDraftChange((current) => ({
            ...current,
            reuseSession: value === 'reuse',
            skipWhileSessionOpen: value === 'skip',
            workspaceMode: value === 'reuse' ? 'existing' : current.workspaceMode
          }))
        }}
        size="sm"
        className={toggleGroupClassName}
      >
        <ToggleGroupItem value="fresh" className={toggleItemClassName}>
          {translate('auto.components.automations.AutomationSessionField.c90888ee94', 'Fresh')}
        </ToggleGroupItem>
        <ToggleGroupItem value="reuse" className={toggleItemClassName}>
          {translate('auto.components.automations.AutomationSessionField.f3c76dce51', 'Reuse')}
        </ToggleGroupItem>
        <ToggleGroupItem value="skip" className={toggleItemClassName}>
          {translate(
            'auto.components.automations.AutomationSessionField.skipIfOpen',
            'Skip if open'
          )}
        </ToggleGroupItem>
      </ToggleGroup>
      {sessionChoice(draft) === 'fresh' ? (
        <label className="flex items-center gap-2 pt-1 text-xs">
          <Checkbox
            checked={!draft.keepSessionOpen}
            onCheckedChange={(checked) =>
              onDraftChange((current) => ({ ...current, keepSessionOpen: checked !== true }))
            }
          />
          {translate(
            'auto.components.automations.AutomationSessionField.closeWhenDone',
            'Close the session when the run finishes'
          )}
        </label>
      ) : null}
    </Field>
  )
}
