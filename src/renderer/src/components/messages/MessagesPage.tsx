import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Loader2, MessagesSquare, RefreshCw } from 'lucide-react'
import type {
  AgentMessageLogEntry,
  AgentMessageLogListResult
} from '../../../../shared/agent-message-log-contract'
import {
  AGENT_MESSAGE_LOG_LIST_MAX,
  AGENT_MESSAGE_LOG_RETENTION_DAYS
} from '../../../../shared/agent-message-log-contract'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { formatUiRelativeTime } from '@/i18n/relative-time-format'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { useAppStore } from '@/store'
import { getIndexedWorktreeMap } from '@/store/worktree-repo-index'
import { selectWorktreesByRepo } from '@/store/workspace-record-selectors'

const LOCAL_RUNTIME = { kind: 'local' } as const

/** Log of messages sent to agents with `orca terminal send`, newest first. */
export default function MessagesPage(): React.JSX.Element {
  const closePage = useAppStore((state) => state.closeMessagesPage)
  const [entries, setEntries] = useState<AgentMessageLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadedAt, setLoadedAt] = useState(0)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await callRuntimeRpc<AgentMessageLogListResult>(
        LOCAL_RUNTIME,
        'agentMessageLog.list'
      )
      setEntries(result.entries)
      setLoadedAt(Date.now())
      setError(null)
    } catch (loadError) {
      console.error('Failed to load the message log:', loadError)
      setError(
        translate('auto.components.messages.MessagesPage.loadFailed', 'Could not load messages.')
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return
      }
      event.preventDefault()
      closePage()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closePage])

  return (
    <main className="relative flex h-full min-h-0 flex-1 flex-col bg-background pt-5 text-foreground md:pt-6">
      <header
        className="flex shrink-0 items-center gap-3 px-3 pb-1 md:px-5"
        // Why: no stacked center titlebar on this page; keep the title clear of Windows/Linux window controls.
        style={{ paddingRight: 'max(0.75rem, var(--window-controls-width, 0px))' }}
      >
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold leading-8">
          {translate('auto.components.messages.MessagesPage.title', 'Messages')}
        </h1>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {translate('auto.components.messages.MessagesPage.refresh', 'Refresh')}
        </Button>
      </header>
      <p className="shrink-0 px-3 pb-3 text-xs text-muted-foreground md:px-5">
        {translate(
          'auto.components.messages.MessagesPage.retentionNotice',
          'Text sent to terminals with `orca terminal send` in the last {{days}} days. Older messages are deleted.',
          { days: AGENT_MESSAGE_LOG_RETENTION_DAYS }
        )}
        {entries.length >= AGENT_MESSAGE_LOG_LIST_MAX
          ? ` ${translate(
              'auto.components.messages.MessagesPage.capNotice',
              'Showing the latest {{count}}.',
              { count: AGENT_MESSAGE_LOG_LIST_MAX }
            )}`
          : null}
      </p>

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-destructive/30 bg-destructive/10 px-3 py-2 md:px-5">
          <p className="min-w-0 flex-1 text-xs text-destructive">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={loading}
            onClick={() => void load()}
          >
            {translate('auto.components.messages.MessagesPage.retry', 'Retry')}
          </Button>
        </div>
      ) : null}

      {!loading && !error && entries.length === 0 ? (
        <div className="flex min-h-72 flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
          <MessagesSquare className="size-8 text-muted-foreground" />
          <p className="max-w-sm text-xs leading-5 text-muted-foreground">
            {translate(
              'auto.components.messages.MessagesPage.empty',
              'No messages yet. They appear here when an agent or script runs `orca terminal send`.'
            )}
          </p>
          <Button type="button" variant="outline" size="xs" onClick={() => void load()}>
            {translate('auto.components.messages.MessagesPage.refresh', 'Refresh')}
          </Button>
        </div>
      ) : (
        <ol className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto px-2 pb-4 md:px-4">
          {entries.map((entry) => (
            <MessageRow key={entry.id} entry={entry} now={loadedAt} />
          ))}
        </ol>
      )}
    </main>
  )
}

function MessageRow({
  entry,
  now
}: {
  entry: AgentMessageLogEntry
  // When the list was loaded, so relative times stay pure and match the data's age.
  now: number
}): React.JSX.Element {
  const worktreeName = useAppStore((state) =>
    entry.worktreeId
      ? getIndexedWorktreeMap(selectWorktreesByRepo(state)).get(entry.worktreeId)?.displayName
      : undefined
  )
  const recipient = [
    worktreeName ??
      entry.branch?.replace(/^refs\/heads\//, '') ??
      lastPathSegment(entry.worktreePath) ??
      entry.targetHandle,
    entry.agent ?? entry.terminalTitle
  ]
    .filter(Boolean)
    .join(' · ')
  const firstLine = entry.text.split('\n').find((line) => line.trim().length > 0) ?? ''
  return (
    <li>
      <Collapsible>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full cursor-pointer items-start gap-4 rounded-md px-2 py-2 text-left outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:hover:bg-accent/50"
          >
            <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="truncate text-[13px] font-medium"
                  title={entry.worktreePath ?? undefined}
                >
                  {recipient}
                </span>
                {entry.outcome !== 'accepted' ? (
                  <Badge variant="destructive" className="shrink-0">
                    {entry.outcome === 'refused'
                      ? translate('auto.components.messages.MessagesPage.refused', 'Not delivered')
                      : translate('auto.components.messages.MessagesPage.failed', 'Failed')}
                  </Badge>
                ) : null}
              </span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {firstLine}
              </span>
            </span>
            <time
              dateTime={new Date(entry.sentAt).toISOString()}
              title={new Date(entry.sentAt).toLocaleString(getIntlLocale())}
              className="shrink-0 text-xs font-normal text-muted-foreground"
            >
              {formatUiRelativeTime(entry.sentAt - now)}
            </time>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-2 pb-3 pl-7">
            <pre className="scrollbar-sleek max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 font-mono text-xs select-text">
              {entry.text}
            </pre>
            <p className="mt-1.5 text-xs break-all text-muted-foreground select-text">
              <span className="font-medium text-foreground">
                {translate('auto.components.messages.MessagesPage.recipientLabel', 'Sent to')}
              </span>{' '}
              {entry.worktreePath ? <span className="font-mono">{entry.worktreePath}</span> : null}
              {entry.worktreePath ? ' · ' : null}
              {translate(
                'auto.components.messages.MessagesPage.recipientTerminal',
                'terminal {{handle}}',
                {
                  handle: entry.targetHandle
                }
              )}
              {entry.refusedReason ? ` · ${entry.refusedReason}` : null}
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

function lastPathSegment(path: string | null): string | null {
  return (
    path
      ?.replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() || null
  )
}
