import React from 'react'
import { AgentStateDot, agentStateLabel } from '@/components/AgentStateDot'
import { AgentTypeIcon } from '@/lib/agent-type-icon'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import type { NotesSendAgentTarget } from '@/lib/notes-send-agent-targets'
import { formatAgentTypeLabel } from '@/lib/agent-status'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { lastEnteredDoneAt } from '@/components/dashboard/agent-finished-timestamp'
import { useAgentRowConversationName } from '@/components/dashboard/use-agent-row-conversation-name'
import { getAgentRowPrimaryText } from '../../../../shared/agent-row-primary-text'
import { agentRowDisplayDotState } from '@/lib/agent-row-dot-state'
import { translate } from '@/i18n/i18n'
import { agentSendDisabledReasonLabel } from '@/lib/agent-send-disabled-reason-label'

export type OrderedSendTarget = {
  target: NotesSendAgentTarget
  agent: DashboardAgentRowData | null
}

/** Rows backed by a sidebar agent show its conversation name; bare terminals fall back to the type. */
export function SendAgentTargetMenuItem({
  target,
  agent,
  now,
  disabled,
  onSend
}: AgentTargetMenuItemProps): React.JSX.Element {
  const itemProps = { target, now, disabled, onSend }
  return agent ? (
    <AgentRowTargetMenuItem {...itemProps} agent={agent} />
  ) : (
    <AgentTargetMenuItem {...itemProps} agent={null} name="" />
  )
}

type AgentTargetMenuItemProps = {
  target: NotesSendAgentTarget
  agent: DashboardAgentRowData | null
  now: number
  disabled: boolean
  onSend: (target: NotesSendAgentTarget) => void
}

export function AgentRowTargetMenuItem(
  props: AgentTargetMenuItemProps & { agent: DashboardAgentRowData }
): React.JSX.Element {
  const conversationName = useAgentRowConversationName(props.agent)
  // Same name as the agent's sidebar row, so same-type agents stay distinguishable.
  const name = conversationName ?? getAgentRowPrimaryText(props.agent.entry)
  return <AgentTargetMenuItem {...props} name={name} />
}

export function AgentTargetMenuItem({
  target,
  agent,
  name,
  now,
  disabled,
  onSend
}: AgentTargetMenuItemProps & { name: string }): React.JSX.Element {
  const tabTitle = target.tabTitle.trim()
  const typeLabel = formatAgentTypeLabel(target.agentType ?? agent?.agentType)
  // Use the sidebar’s display state so failed/stopped agents agree across surfaces.
  const state = agent ? agentRowDisplayDotState(agent) : 'idle'
  const timeAgo = agent ? formatAgentRelativeTime(agent, now) : null
  const disabledReason =
    target.status === 'disabled' && target.disabledReason
      ? agentSendDisabledReasonLabel(target.disabledReason)
      : undefined
  const secondaryParts = [
    ...(name ? [typeLabel] : []),
    agentStateLabel(state),
    ...(timeAgo ? [timeAgo] : []),
    // Why: unnamed rows keep the raw tab title as their only differentiator.
    ...(!name && tabTitle ? [tabTitle] : [])
  ]
  return (
    <DropdownMenuItem
      disabled={disabled}
      onSelect={() => onSend(target)}
      // Match dashboard tooltips for disabled reasons; otherwise show the full, possibly truncated, name.
      title={disabledReason ?? (name || undefined)}
      className="min-w-[240px] gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 font-medium"
    >
      {/* Why: the ancestor's actionable disabled reason must win on every hit area. */}
      <AgentStateDot
        state={state}
        size="sm"
        className="shrink-0"
        title={disabledReason ? null : undefined}
      />
      <AgentTypeIcon agentType={target.agentType ?? agent?.agentType} size={14} />
      <span className="grid max-w-[300px] min-w-0 flex-1 text-left">
        <span className="truncate">{name || typeLabel}</span>
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
    return translate('auto.components.editor.ReviewNotesSendMenu.justNow', 'just now')
  }
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 60) {
    return translate('auto.components.editor.ReviewNotesSendMenu.minutesAgo', '{{minutes}}m ago', {
      minutes
    })
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return translate('auto.components.editor.ReviewNotesSendMenu.hoursAgo', '{{hours}}h ago', {
      hours
    })
  }
  return translate('auto.components.editor.ReviewNotesSendMenu.daysAgo', '{{days}}d ago', {
    days: Math.floor(hours / 24)
  })
}
