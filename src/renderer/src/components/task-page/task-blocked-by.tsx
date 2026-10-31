import { Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

const SHOWN = 3

/**
 * IDs of open tasks blocking this one, in the destructive tone; nothing when unblocked. With
 * `onOpen`, each ID is a button that opens that blocker without reaching the enclosing row.
 */
export function TaskBlockedBy({
  ids,
  onOpen,
  className
}: {
  ids: readonly string[] | undefined
  onOpen?: (id: string) => void
  className?: string
}): React.JSX.Element | null {
  if (!ids?.length) {
    return null
  }
  const label = translate('taskProviders.blockedBy', 'Blocked by {{ids}}', { ids: ids.join(', ') })
  const shown = ids.slice(0, SHOWN)
  return (
    <span
      className={cn('flex min-w-0 items-center gap-0.5 font-mono text-destructive', className)}
      title={label}
      aria-label={onOpen ? undefined : label}
    >
      <Ban className="size-3 shrink-0" aria-hidden />
      {onOpen ? (
        shown.map((id) => (
          <Button
            key={id}
            variant="destructive-chip"
            size="chip"
            aria-label={translate('taskProviders.openIssue', 'Open {{key}}', { key: id })}
            onClick={(event) => {
              event.stopPropagation()
              onOpen(id)
            }}
          >
            {id}
          </Button>
        ))
      ) : (
        <span className="truncate">{shown.join(', ')}</span>
      )}
      {ids.length > SHOWN ? <span className="shrink-0">+{ids.length - SHOWN}</span> : null}
    </span>
  )
}
