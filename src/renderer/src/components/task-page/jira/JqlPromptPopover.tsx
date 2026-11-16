import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { translate } from '@/i18n/i18n'
import { JIRA_JQL_GENERATION_INSTRUCTION_MAX_LENGTH } from '../../../../../shared/jira/jira-jql-generation'
import type { TaskPageComposerActionsModel } from '../use-task-page-composer-actions'
import { useTaskPageJiraJqlGeneration } from '../../use-task-page-jira-jql-generation'

/** Sparkles button next to the Jira search field that asks an agent to rewrite the JQL. */
export function TaskPageJiraJqlPromptPopover({
  model
}: {
  model: TaskPageComposerActionsModel
}): React.JSX.Element | null {
  const { available, generating, error, generate, cancel, clearError } =
    useTaskPageJiraJqlGeneration(model)
  const [open, setOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const label = translate('jira.jqlPrompt.open', 'Ask an agent to edit the JQL')
  const submit = async (): Promise<void> => {
    if (await generate(instruction)) {
      setInstruction('')
      setOpen(false)
    }
  }
  if (!available) {
    return null
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          clearError()
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={label}>
              {generating ? (
                <LoadingSpinner className="size-3.5" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <form
          className="space-y-2 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label htmlFor="jira-jql-prompt" className="text-xs font-medium">
            {label}
          </label>
          <Input
            id="jira-jql-prompt"
            autoFocus
            value={instruction}
            disabled={generating}
            maxLength={JIRA_JQL_GENERATION_INSTRUCTION_MAX_LENGTH}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={translate(
              'jira.jqlPrompt.placeholder',
              'e.g. only bugs, updated this week'
            )}
          />
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            {generating ? (
              <Button type="button" variant="ghost" size="sm" onClick={cancel}>
                {translate('jira.jqlPrompt.stop', 'Stop')}
              </Button>
            ) : null}
            <Button type="submit" size="sm" disabled={generating || !instruction.trim()}>
              {generating ? <LoadingSpinner className="size-3.5" /> : null}
              {translate('jira.jqlPrompt.generate', 'Generate')}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
