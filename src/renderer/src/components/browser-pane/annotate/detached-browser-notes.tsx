import { useState } from 'react'
import { ArchiveRestore, ExternalLink, MessageSquareDashed, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type { DetachedBrowserNoteGroup } from '../../../../../shared/browser-detached-annotation-schema'

const NO_GROUPS: DetachedBrowserNoteGroup[] = []

/** Number of unsent notes the worktree keeps from closed browser pages. */
export function useDetachedBrowserNoteCount(worktreeId: string): number {
  // Optional read: card and pane suites mock partial stores without this slice.
  return useAppStore((s) =>
    (s.detachedBrowserAnnotationsByWorktree?.[worktreeId] ?? NO_GROUPS).reduce(
      (count, group) => count + group.annotations.length,
      0
    )
  )
}

export function detachedBrowserNotesLabel(count: number): string {
  return translate(
    'auto.components.browserPane.annotate.detachedNotes.count',
    '{{count}} unsent notes from closed pages',
    { count, defaultValue_one: '{{count}} unsent note from a closed page' }
  )
}

function groupLabel(group: DetachedBrowserNoteGroup): string {
  return group.origin.docLocation?.filePath ?? (group.origin.title || group.origin.url)
}

/** The closed pages' notes, each group reopenable, attachable to the current page, or discardable. */
function DetachedBrowserNotesList({
  worktreeId,
  attachToPageId,
  onActed
}: {
  worktreeId: string
  attachToPageId?: string
  onActed: () => void
}): React.JSX.Element {
  const groups = useAppStore((s) => s.detachedBrowserAnnotationsByWorktree[worktreeId] ?? NO_GROUPS)
  const confirm = useConfirmationDialog()
  const discard = (group: DetachedBrowserNoteGroup): void => {
    void confirm({
      title: translate(
        'auto.components.browserPane.annotate.detachedNotes.discardTitle',
        'Discard {{count}} unsent notes?',
        { count: group.annotations.length, defaultValue_one: 'Discard {{count}} unsent note?' }
      ),
      description: groupLabel(group),
      descriptionClassName: 'break-all',
      confirmLabel: translate(
        'auto.components.browserPane.annotate.detachedNotes.discardConfirm',
        'Discard'
      ),
      confirmVariant: 'destructive'
    }).then((confirmed) => {
      if (confirmed) {
        useAppStore.getState().discardDetachedBrowserNotes(worktreeId, group.id)
      }
    })
  }
  return (
    <div className="flex max-h-72 flex-col gap-0.5 overflow-auto scrollbar-sleek">
      {groups.map((group) => (
        <div
          key={group.id}
          className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent"
          title={new Date(group.detachedAt).toLocaleString(getIntlLocale())}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-foreground">{groupLabel(group)}</div>
            <div className="truncate text-muted-foreground">
              {group.annotations.map((note) => note.comment).join(' · ')}
            </div>
          </div>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {group.annotations.length}
          </span>
          {attachToPageId ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={translate(
                    'auto.components.browserPane.annotate.detachedNotes.attachHere',
                    'Add to this page'
                  )}
                  onClick={() => {
                    useAppStore
                      .getState()
                      .reattachDetachedBrowserNotes(worktreeId, group.id, attachToPageId)
                    onActed()
                  }}
                >
                  <ArchiveRestore className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {translate(
                  'auto.components.browserPane.annotate.detachedNotes.attachHere',
                  'Add to this page'
                )}
              </TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={translate(
                  'auto.components.browserPane.annotate.detachedNotes.reopen',
                  'Reopen with notes'
                )}
                onClick={() => {
                  useAppStore.getState().reopenDetachedBrowserNotes(worktreeId, group.id)
                  onActed()
                }}
              >
                <ExternalLink className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {translate(
                'auto.components.browserPane.annotate.detachedNotes.reopen',
                'Reopen with notes'
              )}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-xs"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                aria-label={translate(
                  'auto.components.browserPane.annotate.detachedNotes.discard',
                  'Discard notes'
                )}
                onClick={() => discard(group)}
              >
                <Trash2 className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {translate(
                'auto.components.browserPane.annotate.detachedNotes.discard',
                'Discard notes'
              )}
            </TooltipContent>
          </Tooltip>
        </div>
      ))}
    </div>
  )
}

/** Count chip that opens the worktree's notes from closed browser pages. */
export function DetachedBrowserNotesButton({
  worktreeId,
  count,
  attachToPageId,
  className,
  showLabel = false
}: {
  worktreeId: string
  count: number
  attachToPageId?: string
  className?: string
  showLabel?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const label = detachedBrowserNotesLabel(count)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex shrink-0 items-center gap-0.5 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&>svg]:size-3.5',
            className
          )}
          data-detached-browser-notes=""
          aria-label={label}
          title={label}
        >
          <MessageSquareDashed />
          {showLabel ? (
            <span className="text-xs">{label}</span>
          ) : (
            <span className="text-2xs font-semibold leading-none tabular-nums" aria-hidden>
              {count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="px-2 pt-1 pb-1.5 text-xs font-medium text-foreground">{label}</div>
        <DetachedBrowserNotesList
          worktreeId={worktreeId}
          attachToPageId={attachToPageId}
          onActed={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
