import React from 'react'
import { AgentStateDot, agentStateLabel } from '@/components/AgentStateDot'
import { AgentIcon } from '@/lib/agent-catalog'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import type { NotesSendAgentTarget } from '@/lib/notes-send-agent-targets'
import { formatAgentTypeLabel, agentTypeToIconAgent } from '@/lib/agent-status'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { lastEnteredDoneAt } from '@/components/dashboard/agent-finished-timestamp'
import { agentRowDisplayDotState } from '@/lib/agent-row-dot-state'

export type OrderedSendTarget = {
  target: NotesSendAgentTarget
  agent: DashboardAgentRowData | null
}

export function AgentTargetMenuItem({
  target,
  agent,
  now,
  disabled,
  onSend
}: {
  target: NotesSendAgentTarget
  agent: DashboardAgentRowData | null
  now: number
  disabled: boolean
  onSend: (target: NotesSendAgentTarget) => void
}): React.JSX.Element {
  const tabTitle = target.tabTitle.trim()
  // Why: the sidebar row's own state, so a failed or stopped agent reads the same in both places.
  const state = agent ? agentRowDisplayDotState(agent) : 'idle'
  const timeAgo = agent ? formatAgentRelativeTime(agent, now) : null
  const disabledReason = target.status === 'disabled' ? target.disabledReason : undefined
  const secondaryParts = [
    agentStateLabel(state),
    ...(timeAgo ? [timeAgo] : []),
    ...(tabTitle ? [tabTitle] : [])
  ]
  return (
    <DropdownMenuItem
      disabled={disabled}
      onSelect={() => onSend(target)}
      // Why: surface the ineligibility reason (permission/stale/no-terminal) as a
      // hover tooltip rather than inline text, matching DashboardAgentRow's
      // title-attribute treatment of the same disabledReason.
      title={disabledReason}
      className="min-w-[240px] gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 font-medium"
    >
      {/* Why: the ancestor's actionable disabled reason must win on every hit area. */}
      <AgentStateDot
        state={state}
        size="sm"
        className="shrink-0"
        title={disabledReason ? null : undefined}
      />
      <AgentIcon agent={agentTypeToIconAgent(target.agentType ?? agent?.agentType)} size={14} />
      <span className="grid min-w-0 flex-1 text-left">
        <span className="truncate">
          {formatAgentTypeLabel(target.agentType ?? agent?.agentType)}
        </span>
        <span className="truncate text-[11px] font-normal text-muted-foreground">
          {secondaryParts.join(' · ')}
        </span>
      </span>
    </DropdownMenuItem>
  )
}

export function orderSendTargetsByWorktreeAgentRows(
  sendTargets: NotesSendAgentTarget[],
  agentRows: DashboardAgentRowData[]
): OrderedSendTarget[] {
  const targetsByPaneKey = new Map(sendTargets.map((target) => [target.paneKey, target]))
  const usedPaneKeys = new Set<string>()
  const ordered: OrderedSendTarget[] = []

  for (const agent of agentRows) {
    const target = targetsByPaneKey.get(agent.paneKey)
    if (!target) {
      continue
    }
    ordered.push({ target: { ...target, agentType: agent.agentType }, agent })
    usedPaneKeys.add(target.paneKey)
  }

  for (const target of sendTargets) {
    if (!usedPaneKeys.has(target.paneKey)) {
      ordered.push({ target, agent: null })
    }
  }

  return ordered
}

function formatAgentRelativeTime(agent: DashboardAgentRowData, now: number): string | null {
  const doneAt = lastEnteredDoneAt(agent)
  if (doneAt !== null) {
    return `${formatTimeAgo(doneAt, now)}`
  }
  const startedAt = agent.startedAt > 0 ? agent.startedAt : agent.entry.stateStartedAt
  return startedAt > 0 ? `${formatTimeAgo(startedAt, now)}` : null
}

function formatTimeAgo(ts: number, now: number): string {
  const delta = now - ts
  if (delta < 60_000) {
    return 'just now'
  }
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  return `${Math.floor(hours / 24)}d ago`
}
