import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { useStructuredChatTabNames } from '@/runtime/structured-chat-name-observation'
import type { AppState } from '@/store/types'
import {
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import type { NotesSendAgentTarget } from '@/lib/notes-send-agent-targets'
import {
  deriveNotesSendOtherWorkspaces,
  withSourceWorkspaceHeader,
  type NotesSendOtherWorkspace,
  type NotesSendOtherWorkspacesState
} from '@/lib/notes-send-other-workspaces'
import { useWorktreeAgentRows } from '@/components/sidebar/useWorktreeAgentRows'
import { translate } from '@/i18n/i18n'
import {
  SendAgentTargetMenuItem,
  orderSendTargetsByWorktreeAgentRows
} from './ReviewNotesSendAgentTargetItem'
import {
  selectDetectedWorktreesByRepo,
  selectFolderWorkspaces,
  selectWorktreesByRepo
} from '@/store/workspace-record-selectors'

type SendToWorkspaceAgent = (
  target: NotesSendAgentTarget,
  targetWorktreeId: string,
  targetPrompt: string
) => void

function selectOtherWorkspacesInputs(state: AppState): NotesSendOtherWorkspacesState {
  return {
    agentStatusByPaneKey: state.agentStatusByPaneKey,
    tabsByWorktree: state.tabsByWorktree,
    unifiedTabsByWorktree: state.unifiedTabsByWorktree,
    terminalLayoutsByTabId: state.terminalLayoutsByTabId,
    ptyIdsByTabId: state.ptyIdsByTabId,
    runtimePaneTitlesByTabId: state.runtimePaneTitlesByTabId,
    repos: state.repos,
    worktreesByRepo: selectWorktreesByRepo(state),
    detectedWorktreesByRepo: selectDetectedWorktreesByRepo(state),
    folderWorkspaces: selectFolderWorkspaces(state),
    projectGroups: state.projectGroups,
    settings: state.settings,
    restoredRuntimeHostIdByWorkspaceSessionKey: state.restoredRuntimeHostIdByWorkspaceSessionKey,
    activeWorktreeId: state.activeWorktreeId,
    activeWorkspaceExecutionHostId: state.activeWorkspaceExecutionHostId,
    runtimeEnvironments: state.runtimeEnvironments,
    runtimeEnvironmentCatalogHydrated: state.runtimeEnvironmentCatalogHydrated,
    removedRuntimeEnvironmentIds: state.removedRuntimeEnvironmentIds
  }
}

/** "Other workspaces" submenu: hands this workspace's notes to an agent of another same-host workspace. */
export function ReviewNotesSendOtherWorkspacesMenu({
  sourceWorktreeId,
  prompt,
  now,
  disabled,
  onSend
}: {
  sourceWorktreeId: string
  prompt: string
  now: number
  disabled: boolean
  onSend: SendToWorkspaceAgent
}): React.JSX.Element | null {
  const inputs = useAppStore(useShallow(selectOtherWorkspacesInputs))
  const agentStatusEpoch = useAppStore((s) => s.agentStatusEpoch)
  const chatNames = useStructuredChatTabNames()
  const { source, workspaces } = useMemo(() => {
    // Why: stale-boundary timers bump this epoch without replacing the status map.
    void agentStatusEpoch
    return deriveNotesSendOtherWorkspaces(inputs, sourceWorktreeId, chatNames, now)
  }, [agentStatusEpoch, chatNames, inputs, now, sourceWorktreeId])

  if (!source || workspaces.length === 0) {
    return null
  }
  const headedPrompt = withSourceWorkspaceHeader(prompt, source)
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={disabled}>
          {translate(
            'auto.components.editor.ReviewNotesSendOtherWorkspacesMenu.otherWorkspaces',
            'Other workspaces'
          )}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-[180px]">
          {workspaces.map((workspace) => (
            <OtherWorkspaceTargets
              key={workspace.worktreeId}
              workspace={workspace}
              now={now}
              disabled={disabled}
              onSend={(target) => onSend(target, workspace.worktreeId, headedPrompt)}
            />
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  )
}

function OtherWorkspaceTargets({
  workspace,
  now,
  disabled,
  onSend
}: {
  workspace: NotesSendOtherWorkspace
  now: number
  disabled: boolean
  onSend: (target: NotesSendAgentTarget) => void
}): React.JSX.Element {
  // Why: mounted only while the submenu is open, so the per-workspace rows cost nothing otherwise.
  const agentRows = useWorktreeAgentRows(workspace.worktreeId)
  const ordered = useMemo(
    () => orderSendTargetsByWorktreeAgentRows(workspace.targets, agentRows),
    [agentRows, workspace.targets]
  )
  return (
    <>
      <DropdownMenuLabel className="grid">
        <span className="truncate">{workspace.displayName}</span>
        <span className="truncate font-normal text-muted-foreground">{workspace.projectName}</span>
      </DropdownMenuLabel>
      {ordered.map(({ target, agent }) => (
        <SendAgentTargetMenuItem
          key={target.paneKey}
          target={target}
          agent={agent}
          now={now}
          disabled={disabled || target.status !== 'eligible'}
          onSend={onSend}
        />
      ))}
    </>
  )
}
