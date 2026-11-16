import {
  collectActiveDashboardWorkspaces,
  type DashboardWorkspaceState
} from '@/components/dashboard/dashboard-snapshot-workspaces'
import { getKnownExecutionHostIdForWorktree } from './worktree-runtime-owner'
import type { WorktreeRuntimeOwnerState } from './worktree-runtime-owner-state'
import {
  deriveNotesSendAgentTargets,
  type NotesSendAgentTarget,
  type NotesSendAgentTargetState
} from './notes-send-agent-targets'
import type { StructuredChatTabNames } from '@/runtime/structured-chat-tab-name'

export type NotesSendOtherWorkspacesState = NotesSendAgentTargetState &
  DashboardWorkspaceState &
  WorktreeRuntimeOwnerState

export type NotesSendSourceWorkspace = { displayName: string; path: string }

export type NotesSendOtherWorkspace = {
  worktreeId: string
  displayName: string
  projectName: string
  targets: NotesSendAgentTarget[]
}

/**
 * Other workspaces whose agents can receive notes from `sourceWorktreeId`.
 *
 * Only workspaces on the source's execution host are offered: the notes name files by a path on
 * that host. An unknown host on either side offers nothing rather than guessing.
 */
export function deriveNotesSendOtherWorkspaces(
  state: NotesSendOtherWorkspacesState,
  sourceWorktreeId: string,
  chatNames: StructuredChatTabNames,
  now = Date.now()
): { source: NotesSendSourceWorkspace | null; workspaces: NotesSendOtherWorkspace[] } {
  const all = collectActiveDashboardWorkspaces(state, false)
  const sourceEntry = all.find((workspace) => workspace.worktree.id === sourceWorktreeId)
  const sourceHostId = getKnownExecutionHostIdForWorktree(state, sourceWorktreeId)
  if (!sourceEntry || !sourceHostId) {
    return { source: null, workspaces: [] }
  }
  const workspaces: NotesSendOtherWorkspace[] = []
  for (const { worktree, projectName } of all) {
    if (
      worktree.id === sourceWorktreeId ||
      getKnownExecutionHostIdForWorktree(state, worktree.id) !== sourceHostId
    ) {
      continue
    }
    const targets = deriveNotesSendAgentTargets(state, worktree.id, chatNames, now)
    if (targets.length > 0) {
      workspaces.push({
        worktreeId: worktree.id,
        displayName: worktree.displayName,
        projectName,
        targets
      })
    }
  }
  workspaces.sort((a, b) => a.displayName.localeCompare(b.displayName))
  return {
    source: { displayName: sourceEntry.worktree.displayName, path: sourceEntry.worktree.path },
    workspaces
  }
}

/** Tells an agent in another workspace where the notes' relative file paths live. */
export function withSourceWorkspaceHeader(
  prompt: string,
  source: NotesSendSourceWorkspace
): string {
  // Why: agent-facing text, like formatDiffComments; it stays English and untranslated.
  return `These review notes are about the workspace "${source.displayName}" at ${source.path}; file paths below are relative to it.\n\n${prompt}`
}
