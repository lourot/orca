import React, { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import {
  useStructuredChatTabNames,
  getStructuredChatTabNames
} from '@/runtime/structured-chat-name-observation'
import { QuickLaunchAgentMenuItems } from '@/components/tab-bar/QuickLaunchButton'
import { DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import {
  activeAgentNotesSendFailureMessage,
  type ActiveAgentNotesSendResult
} from '@/lib/active-agent-note-send'
import { sendMessageToAgent } from '@/lib/agent-message-send'
import {
  deriveNotesSendAgentTargets,
  type NotesSendAgentTarget
} from '@/lib/notes-send-agent-targets'
import { agentKindForAgentType } from '@/lib/agent-status'
import { track } from '@/lib/telemetry'
import { useNow } from '@/hooks/use-now'
import { selectLivePtyIdsForWorktree } from '@/components/sidebar/worktree-card-status-inputs'
import { useWorktreeAgentRows } from '@/components/sidebar/useWorktreeAgentRows'
import type { LaunchSource } from '../../../../shared/telemetry-events'
import { translate } from '@/i18n/i18n'
import { agentSendDisabledReasonLabel } from '@/lib/agent-send-disabled-reason-label'
import {
  AgentRowTargetMenuItem,
  AgentTargetMenuItem,
  orderSendTargetsByWorktreeAgentRows
} from './ReviewNotesSendAgentTargetItem'
import { ReviewNotesSendOtherWorkspacesMenu } from './ReviewNotesSendOtherWorkspacesMenu'

export function ReviewNotesSendMenuContent({
  worktreeId,
  groupId,
  prompt,
  promptDelivery = 'submit-after-ready',
  launchSource = 'notes_send',
  onPromptDelivered,
  onPromptHandedOff
}: {
  worktreeId: string
  groupId: string
  prompt: string
  promptDelivery?: 'auto-submit' | 'draft' | 'submit-after-ready'
  launchSource?: LaunchSource
  onPromptDelivered?: () => void
  /** Given each send's own result the moment its prompt is handed to an agent. */
  onPromptHandedOff?: (delivered: Promise<unknown>) => void
}): React.JSX.Element {
  const hasPrompt = prompt.trim().length > 0

  // Include every workspace agent, not just the focused pane; memoize slice-derived targets to avoid fresh selector arrays.
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const tabsByWorktree = useAppStore((s) => s.tabsByWorktree)
  const unifiedTabsByWorktree = useAppStore((s) => s.unifiedTabsByWorktree)
  const terminalLayoutsByTabId = useAppStore((s) => s.terminalLayoutsByTabId)
  const ptyIdsByTabId = useAppStore(useShallow((s) => selectLivePtyIdsForWorktree(s, worktreeId)))
  const runtimePaneTitlesByTabId = useAppStore((s) => s.runtimePaneTitlesByTabId)
  const agentStatusEpoch = useAppStore((s) => s.agentStatusEpoch)
  const agentRows = useWorktreeAgentRows(worktreeId)
  const now = useNow(30_000)
  const chatNames = useStructuredChatTabNames()
  const sendTargets = useMemo(() => {
    void agentStatusEpoch
    return deriveNotesSendAgentTargets(
      {
        agentStatusByPaneKey,
        tabsByWorktree,
        unifiedTabsByWorktree,
        terminalLayoutsByTabId,
        ptyIdsByTabId,
        runtimePaneTitlesByTabId
      },
      worktreeId,
      chatNames
    )
  }, [
    // Freshness timers can change eligibility through this epoch without replacing the status map.
    agentStatusEpoch,
    chatNames,
    agentStatusByPaneKey,
    tabsByWorktree,
    unifiedTabsByWorktree,
    terminalLayoutsByTabId,
    runtimePaneTitlesByTabId,
    ptyIdsByTabId,
    worktreeId
  ])
  const orderedSendTargets = useMemo(
    () => orderSendTargetsByWorktreeAgentRows(sendTargets, agentRows),
    [agentRows, sendTargets]
  )

  const runNotesSend = useCallback(
    (
      send: () => Promise<ActiveAgentNotesSendResult>,
      onSent: () => void,
      options: { explicitTarget?: boolean } = {}
    ) => {
      // Settle the loading toast in place: immediate sends can resolve before Sonner mounts, racing a separate dismissal.
      const pending = toast.loading(
        translate(
          'auto.components.editor.ReviewNotesSendMenuContent.50f7e753ea',
          'Sending notes...'
        )
      )

      const sending = send()
        .then((result) => {
          if (result.status === 'sent') {
            onSent()
            toast.success(
              translate(
                'auto.components.editor.ReviewNotesSendMenuContent.bb9c69a0c9',
                'Notes sent.'
              ),
              { id: pending }
            )
            return
          }

          // Use a typed toast update; toast.message preserves the loading spinner.
          toast.info(
            activeAgentNotesSendFailureMessage(result.status, {
              explicitTarget: options.explicitTarget,
              code: result.code
            }),
            { id: pending }
          )
        })
        .catch(() => {
          console.error('Failed to send notes:', { code: 'runtime-unverifiable' })
          toast.error(
            activeAgentNotesSendFailureMessage('status-unavailable', {
              explicitTarget: options.explicitTarget,
              code: 'runtime-unverifiable'
            }),
            { id: pending }
          )
        })
      onPromptHandedOff?.(sending)
    },
    [onPromptHandedOff]
  )

  const sendToAgentTarget = useCallback(
    // Why: another workspace's agent gets its own worktree id and a headed prompt; delivery
    // callbacks still settle this workspace's notes.
    (target: NotesSendAgentTarget, targetWorktreeId = worktreeId, targetPrompt = prompt) => {
      if (!hasPrompt || target.status !== 'eligible') {
        return
      }

      const currentEligibility = resolveCurrentSendTargetEligibility(target, targetWorktreeId)
      if (currentEligibility.status !== 'eligible') {
        toast.message(currentEligibility.disabledReason)
        return
      }

      runNotesSend(
        () =>
          sendMessageToAgent({
            worktreeId: targetWorktreeId,
            prompt: targetPrompt,
            target: target.messageTarget
          }),
        () => {
          onPromptDelivered?.()
          // Match sidebar telemetry for follow-up notes sent through the dropdown.
          track('agent_prompt_sent', {
            agent_kind: agentKindForAgentType(target.agentType),
            launch_source: launchSource,
            request_kind: 'followup'
          })
        },
        { explicitTarget: true }
      )
    },
    [hasPrompt, runNotesSend, worktreeId, prompt, onPromptDelivered, launchSource]
  )

  return (
    <>
      <DropdownMenuLabel>
        {translate('auto.components.editor.ReviewNotesSendMenuContent.03378aea75', 'Send notes to')}
      </DropdownMenuLabel>
      {orderedSendTargets.map(({ target, agent }) => {
        const itemProps = {
          target,
          now,
          disabled: !hasPrompt || target.status !== 'eligible',
          onSend: sendToAgentTarget
        }
        return agent ? (
          <AgentRowTargetMenuItem key={target.paneKey} {...itemProps} agent={agent} />
        ) : (
          <AgentTargetMenuItem key={target.paneKey} {...itemProps} agent={null} name="" />
        )
      })}
      <ReviewNotesSendOtherWorkspacesMenu
        sourceWorktreeId={worktreeId}
        prompt={prompt}
        now={now}
        disabled={!hasPrompt}
        onSend={sendToAgentTarget}
      />
      <DropdownMenuSeparator />
      <DropdownMenuLabel>
        {translate('auto.components.editor.ReviewNotesSendMenuContent.a49800405b', 'New agent')}
      </DropdownMenuLabel>
      <QuickLaunchAgentMenuItems
        worktreeId={worktreeId}
        groupId={groupId}
        onFocusTerminal={focusTerminalTabSurface}
        prompt={prompt}
        promptDelivery={promptDelivery}
        launchSource={launchSource}
        onPromptDelivered={onPromptDelivered}
        onPromptHandedOff={onPromptHandedOff}
        disabled={!hasPrompt}
      />
    </>
  )
}

function resolveCurrentSendTargetEligibility(
  target: NotesSendAgentTarget,
  worktreeId: string
): { status: 'eligible' } | { status: 'disabled'; disabledReason: string } {
  const goneReason =
    target.messageTarget.kind === 'terminal'
      ? translate(
          'auto.components.editor.ReviewNotesSendMenu.terminalGone',
          'Terminal is no longer available'
        )
      : translate('auto.components.editor.ReviewNotesSendMenu.chatGone', 'Chat is no longer open')
  const state = useAppStore.getState()
  const currentTarget = deriveNotesSendAgentTargets(
    state,
    worktreeId,
    getStructuredChatTabNames()
  ).find((candidate) => candidate.paneKey === target.paneKey)
  if (currentTarget) {
    return currentTarget.status === 'eligible'
      ? { status: 'eligible' }
      : {
          status: 'disabled',
          disabledReason: currentTarget.disabledReason
            ? agentSendDisabledReasonLabel(currentTarget.disabledReason)
            : goneReason
        }
  }

  return { status: 'disabled', disabledReason: goneReason }
}
