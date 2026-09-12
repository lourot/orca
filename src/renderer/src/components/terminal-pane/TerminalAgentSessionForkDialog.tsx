import { Copy, GitFork } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  startAgentSessionFork,
  type AgentSessionForkMode,
  type PreparedAgentSessionFork
} from './terminal-agent-session-fork'
import { copyAgentSessionForkContext } from './terminal-agent-session-fork-clipboard'
import { canForkAgentConversation } from '../../../../shared/agent-session-resume'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

type TerminalAgentSessionForkDialogProps = {
  open: boolean
  fork: PreparedAgentSessionFork | null
  onOpenChange: (open: boolean) => void
}

/** Why the full conversation cannot be forked, or null when it can. */
function getFullConversationBlocker(fork: PreparedAgentSessionFork | null): string | null {
  if (!fork || canForkAgentConversation(fork.agent ?? undefined, fork.providerSession)) {
    return null
  }
  if (fork.agent !== 'claude') {
    return translate(
      'auto.components.terminal.pane.TerminalAgentSessionForkDialog.2f95327d0a',
      'Only Claude sessions can be forked with their full conversation.'
    )
  }
  return translate(
    'auto.components.terminal.pane.TerminalAgentSessionForkDialog.a0bb16776b',
    'No session id captured for this pane yet.'
  )
}

function ForkModeCard({
  selected,
  disabled,
  title,
  description,
  badge,
  blocker,
  onSelect
}: {
  selected: boolean
  disabled: boolean
  title: string
  description: string
  badge?: string
  blocker?: string | null
  onSelect: () => void
}): React.JSX.Element {
  // Why not a real `disabled` here: it leaves the tab order, so a screen reader
  // skips the card and never reads why it is blocked. `busy` has no reason to
  // read, so that one stays a real `disabled`.
  const blocked = Boolean(blocker)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={blocked || undefined}
      disabled={disabled}
      onClick={blocked ? undefined : onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        selected ? 'border-ring bg-accent' : 'border-border/60 bg-muted/20',
        disabled || blocked ? 'cursor-not-allowed opacity-60' : 'hover:bg-accent'
      )}
    >
      <GitFork className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 space-y-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          {title}
          {badge ? (
            <Badge variant="secondary" className="uppercase">
              {badge}
            </Badge>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">{description}</p>
        {blocker ? <p className="text-xs text-destructive">{blocker}</p> : null}
      </div>
    </button>
  )
}

export function TerminalAgentSessionForkDialog({
  open,
  fork,
  onOpenChange
}: TerminalAgentSessionForkDialogProps): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const blocker = useMemo(() => getFullConversationBlocker(fork), [fork])
  const [requestedMode, setRequestedMode] = useState<AgentSessionForkMode>('full-conversation')
  const mode: AgentSessionForkMode = blocker ? 'recent-context' : requestedMode

  const handleCopyContext = async (): Promise<void> => {
    if (!fork || busyRef.current) {
      return
    }
    busyRef.current = true
    setBusy(true)
    try {
      if (await copyAgentSessionForkContext(fork)) {
        onOpenChange(false)
      }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const handleStartFork = async (): Promise<void> => {
    if (!fork || busyRef.current) {
      return
    }
    busyRef.current = true
    setBusy(true)
    try {
      if (await startAgentSessionFork({ ...fork, mode })) {
        onOpenChange(false)
      }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const handleOpenChange = (nextOpen: boolean): void => {
    if (busyRef.current && !nextOpen) {
      return
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-4 sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-base">
            {translate(
              'auto.components.terminal.pane.TerminalAgentSessionForkDialog.64e292e8e3',
              'Fork Agent Session'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.terminal.pane.TerminalAgentSessionForkDialog.4835d8f456',
              'The fork appears as its own workspace, not as a nested child. Choose what the new agent starts from.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div
          role="radiogroup"
          aria-label={translate(
            'auto.components.terminal.pane.TerminalAgentSessionForkDialog.a6b56a11b8',
            'What the forked agent starts from'
          )}
          className="space-y-2"
        >
          <ForkModeCard
            selected={mode === 'full-conversation'}
            disabled={busy}
            onSelect={() => setRequestedMode('full-conversation')}
            title={translate(
              'auto.components.terminal.pane.TerminalAgentSessionForkDialog.6948d1847a',
              'Full conversation'
            )}
            description={translate(
              'auto.components.terminal.pane.TerminalAgentSessionForkDialog.b961b7c227',
              'Resumes this agent session in the new workspace with its whole history, under a new session id. The original is left untouched.'
            )}
            badge={translate(
              'auto.components.terminal.pane.TerminalAgentSessionForkDialog.db34dacd3a',
              'New'
            )}
            blocker={blocker}
          />
          <ForkModeCard
            selected={mode === 'recent-context'}
            disabled={busy}
            onSelect={() => setRequestedMode('recent-context')}
            title={translate(
              'auto.components.terminal.pane.TerminalAgentSessionForkDialog.2e15cf62bb',
              'Recent context'
            )}
            description={translate(
              'auto.components.terminal.pane.TerminalAgentSessionForkDialog.7be47ba4c8',
              'Starts a fresh agent and hands it a bounded transcript of this pane as an editable draft.'
            )}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => void handleCopyContext()}>
            <Copy className="size-4" />
            {translate(
              'auto.components.terminal.pane.TerminalAgentSessionForkDialog.17fc841e59',
              'Copy context'
            )}
          </Button>
          <Button disabled={busy} onClick={() => void handleStartFork()}>
            <GitFork className="size-4" />
            {busy
              ? translate(
                  'auto.components.terminal.pane.TerminalAgentSessionForkDialog.2b10412cfc',
                  'Creating...'
                )
              : translate(
                  'auto.components.terminal.pane.TerminalAgentSessionForkDialog.9d25de2920',
                  'Create fork'
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
