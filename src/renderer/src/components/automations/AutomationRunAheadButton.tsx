import { useState } from 'react'
import { Play } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { translate } from '@/i18n/i18n'
import type { Automation } from '../../../../shared/automations-types'

/** Offers an early run only while the next occurrence has no dispatch inside its cooldown window. */
export function AutomationRunAheadButton({
  automation,
  now,
  disabled,
  onRun
}: {
  automation: Automation
  now: number
  disabled: boolean
  onRun: () => void | Promise<void>
}): React.JSX.Element | null {
  const [pending, setPending] = useState(false)
  const [showSpinner, setShowSpinner] = useState(false)
  const cooldownMs = (automation.minMinutesSinceLastRun ?? 0) * 60_000
  const untilNextRun = automation.nextRunAt - now
  const eligible =
    automation.enabled &&
    cooldownMs > 0 &&
    untilNextRun > 0 &&
    untilNextRun < cooldownMs &&
    (automation.lastDispatchedAt === undefined ||
      automation.nextRunAt - automation.lastDispatchedAt > cooldownMs)

  if (!eligible) {
    return null
  }

  const label = translate('automations.runAhead.action', 'Run ahead of schedule')
  return (
    <span
      role="presentation"
      className="inline-flex shrink-0"
      onClick={(event) => event.stopPropagation()}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="success"
            size="icon-xs"
            aria-label={label}
            aria-busy={pending}
            disabled={disabled || pending}
            onClick={async () => {
              setPending(true)
              const spinnerTimer = setTimeout(() => setShowSpinner(true), 200)
              try {
                await onRun()
              } catch (error) {
                toast.error(error instanceof Error ? error.message : String(error))
              } finally {
                clearTimeout(spinnerTimer)
                setShowSpinner(false)
                setPending(false)
              }
            }}
          >
            {showSpinner ? <LoadingSpinner className="size-3" /> : <Play aria-hidden="true" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {label}
        </TooltipContent>
      </Tooltip>
    </span>
  )
}
