import { Copy, GitBranchPlus, GitFork, SquareTerminal, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  type AgentSessionForkDestination,
  type AgentSessionForkMode,
  type PreparedAgentSessionFork
} from './terminal-agent-session-fork'
import { copyAgentSessionForkContext } from './terminal-agent-session-fork-clipboard'
import { canForkAgentConversation } from '../../../../shared/agent-session-fork-resume-argv'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { CodexForkContext } from '../../../../shared/codex-fork-context'

type TerminalAgentSessionForkDialogProps = {
  open: boolean
  fork: PreparedAgentSessionFork | null
  onOpenChange: (open: boolean) => void
}

/** Why the full conversation cannot be forked, or null when it can. */
function getFullConversationBlocker(
  fork: PreparedAgentSessionFork | null,
  codexForkContext: CodexForkContext | 'checking' | null
): string | null {
  if (!fork || !fork.providerSession) {
    return fork?.agent === 'claude' || fork?.agent === 'codex'
      ? translate(
          'auto.components.terminal.pane.TerminalAgentSessionForkDialog.a0bb16776b',
          'No session id captured for this pane yet.'
        )
      : translate(
          'auto.components.terminal.pane.TerminalAgentSessionForkDialog.2f95327d0a',
          'Only Claude and local Codex sessions can be forked with their full conversation.'
        )
  }
  if (fork.agent !== 'claude' && fork.agent !== 'codex') {
    return translate(
      'auto.components.terminal.pane.TerminalAgentSessionForkDialog.2f95327d0a',
      'Only Claude and local Codex sessions can be forked with their full conversation.'
    )
  }
  if (!canForkAgentConversation(fork.agent, fork.providerSession)) {
    return translate(
      'auto.components.terminal.pane.TerminalAgentSessionForkDialog.a0bb16776b',
      'No session id captured for this pane yet.'
    )
  }
  if (fork.agent === 'codex') {
    if (codexForkContext === null || codexForkContext === 'checking') {
      return translate(
        'auto.components.terminal.pane.TerminalAgentSessionForkDialog.checkingCodex',
        'Checking whether this local Codex session can be forked.'
      )
    }
    if (codexForkContext.status === 'unavailable') {
      const messageByReason = {
        'not-local': [
          'auto.components.terminal.pane.TerminalAgentSessionForkDialog.notLocalCodex',
          'Full Codex conversation forks are currently supported only for local sessions.'
        ],
        'source-account-unavailable': [
          'auto.components.terminal.pane.TerminalAgentSessionForkDialog.sourceAccountUnavailable',
          'The source Codex account context is unavailable.'
        ],
        'unsupported-cli': [
          'auto.components.terminal.pane.TerminalAgentSessionForkDialog.unsupportedCodexCli',
          'This Codex CLI does not support conversation forking yet.'
        ]
      } as const
      const [key, fallback] = messageByReason[codexForkContext.reason]
      return translate(key, fallback)
    }
  }
  if (canForkAgentConversation(fork.agent, fork.providerSession)) {
    return null
  }
  return translate(
    'auto.components.terminal.pane.TerminalAgentSessionForkDialog.a0bb16776b',
    'No session id captured for this pane yet.'
  )
}

function ForkOptionCard({
  selected,
  disabled,
  title,
  description,
  badge,
  blocker,
  icon: Icon = GitFork,
  onSelect
}: {
  selected: boolean
  disabled: boolean
  title: string
  description: string
  badge?: string
  blocker?: string | null
  icon?: LucideIcon
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
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 space-y-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          {title}
          {badge ? <Badge variant="secondary">{badge}</Badge> : null}
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
  const [codexForkContext, setCodexForkContext] = useState<CodexForkContext | 'checking' | null>(
    fork?.codexForkContext ?? null
  )
  useEffect(() => {
    let cancelled = false
    setCodexForkContext(fork?.codexForkContext ?? (fork?.agent === 'codex' ? 'checking' : null))
    if (fork?.agent !== 'codex' || fork.codexForkContext || !fork.sourcePtyId) {
      if (fork?.agent === 'codex' && !fork.sourcePtyId && !fork.codexForkContext) {
        setCodexForkContext({ status: 'unavailable', reason: 'source-account-unavailable' })
      }
      return () => {
        cancelled = true
      }
    }
    void window.api.codexAccounts
      .getForkContext({
        ptyId: fork.sourcePtyId,
        ...(fork.sourceCodexCommand ? { command: fork.sourceCodexCommand } : {})
      })
      .then((context) => {
        if (!cancelled) {
          setCodexForkContext(context)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCodexForkContext({ status: 'unavailable', reason: 'source-account-unavailable' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [fork])
  const blocker = useMemo(
    () => getFullConversationBlocker(fork, codexForkContext),
    [codexForkContext, fork]
  )
  const [requestedMode, setRequestedMode] = useState<AgentSessionForkMode>('full-conversation')
  const mode: AgentSessionForkMode = blocker ? 'recent-context' : requestedMode
  const newWorkspaceBlocker = fork?.newWorkspaceBlocked
    ? translate(
        'auto.components.terminal.pane.terminal.agent.session.fork.38e41edc6e',
        'This workspace cannot be forked into a git worktree.'
      )
    : null
  const [requestedDestination, setRequestedDestination] =
    useState<AgentSessionForkDestination>('new-workspace')
  // Why: the dialog stays mounted between forks, and only New workspace is the documented default.
  const [destinationFork, setDestinationFork] = useState(fork)
  if (destinationFork !== fork) {
    setDestinationFork(fork)
    setRequestedDestination('new-workspace')
  }
  const destination: AgentSessionForkDestination = newWorkspaceBlocker
    ? 'this-workspace'
    : requestedDestination
  const forkForStart =
    fork && fork.agent === 'codex' && codexForkContext && codexForkContext !== 'checking'
      ? { ...fork, codexForkContext }
      : fork

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
      if (forkForStart && (await startAgentSessionFork({ ...forkForStart, mode }, destination))) {
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
              'auto.components.terminal.pane.TerminalAgentSessionForkDialog.description',
              'Choose what the new agent starts from and where it opens.'
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
          <ForkOptionCard
            selected={mode === 'full-conversation'}
            disabled={busy}
            onSelect={() => setRequestedMode('full-conversation')}
            title={translate(
              'auto.components.terminal.pane.TerminalAgentSessionForkDialog.6948d1847a',
              'Full conversation'
            )}
            description={translate(
              'auto.components.terminal.pane.TerminalAgentSessionForkDialog.fullConversationDescription',
              'Resumes this agent session with its whole history, under a new session id. The original is left untouched.'
            )}
            badge={translate(
              'auto.components.terminal.pane.TerminalAgentSessionForkDialog.db34dacd3a',
              'New'
            )}
            blocker={blocker}
          />
          <ForkOptionCard
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

        <div
          role="radiogroup"
          aria-label={translate(
            'auto.components.terminal.pane.TerminalAgentSessionForkDialog.destinationLabel',
            'Where the fork opens'
          )}
          className="space-y-2"
        >
          <ForkOptionCard
            selected={destination === 'new-workspace'}
            disabled={busy}
            onSelect={() => setRequestedDestination('new-workspace')}
            icon={GitBranchPlus}
            title={translate(
              'auto.components.terminal.pane.TerminalAgentSessionForkDialog.newWorkspace',
              'New workspace'
            )}
            description={translate(
              'auto.components.terminal.pane.TerminalAgentSessionForkDialog.newWorkspaceDescription',
              'A new top-level git worktree, branched from this one.'
            )}
            blocker={newWorkspaceBlocker}
          />
          <ForkOptionCard
            selected={destination === 'this-workspace'}
            disabled={busy}
            onSelect={() => setRequestedDestination('this-workspace')}
            icon={SquareTerminal}
            title={translate(
              'auto.components.terminal.pane.TerminalAgentSessionForkDialog.thisWorkspace',
              'This workspace'
            )}
            description={translate(
              'auto.components.terminal.pane.TerminalAgentSessionForkDialog.thisWorkspaceDescription',
              'A new tab here, beside this session.'
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
