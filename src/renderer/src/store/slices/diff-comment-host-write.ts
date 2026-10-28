import type { AppState } from '../types'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import {
  assertRuntimeEnvironmentCapability,
  callRuntimeRpc
} from '../../runtime/runtime-rpc-client'
import { runtimeTargetForWorkspaceOwner } from '@/lib/resolve-owner'
import { toRuntimeWorktreeSelector } from '../../runtime/runtime-worktree-selector'
import {
  getExecutionHostIdForFolderWorkspace,
  getRuntimeEnvironmentIdForFolderWorkspace
} from '@/lib/folder-workspace-runtime-owner'
import { callHostRoute } from '@/runtime/host-route-call'
import { hostRouteForAuthority } from '@/runtime/runtime-client-target'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { translate } from '@/i18n/i18n'
import { WORKTREE_GENERAL_NOTES_RUNTIME_CAPABILITY } from '../../../../shared/worktree-runtime-capabilities'
import type { ReviewNoteField } from '../worktree-diff-comments-selector'

/** Refuses general notes for a server that would strip them and still answer success. */
async function assertHostKeepsField(field: ReviewNoteField, environmentId: string): Promise<void> {
  if (field === 'generalNotes') {
    await assertRuntimeEnvironmentCapability(
      environmentId,
      WORKTREE_GENERAL_NOTES_RUNTIME_CAPABILITY,
      translate(
        'generalNotes.hostUpdateRequired',
        'Update Orca on this host to save general notes.'
      )
    )
  }
}

/** Writes one of a workspace's whole note lists to the host that owns it. */
export async function writeDiffCommentsToHost(
  state: AppState,
  worktreeId: string,
  field: ReviewNoteField,
  /** Already normalized by the note kind; sent as-is. */
  notes: readonly unknown[],
  folderExecutionHostId?: ReturnType<typeof getExecutionHostIdForFolderWorkspace>,
  writeHostId?: ExecutionHostId
): Promise<void> {
  const scope = parseWorkspaceKey(worktreeId)
  if (scope?.type === 'folder') {
    const executionHostId =
      folderExecutionHostId ?? getExecutionHostIdForFolderWorkspace(state, scope.folderWorkspaceId)
    const runtimeEnvironmentId = getRuntimeEnvironmentIdForFolderWorkspace(
      state,
      scope.folderWorkspaceId,
      executionHostId
    )
    if (runtimeEnvironmentId) {
      await assertHostKeepsField(field, runtimeEnvironmentId)
    }
    const updates = { [field]: notes }
    const updated = runtimeEnvironmentId
      ? (
          await callHostRoute<{ folderWorkspace: FolderWorkspace | null }>(
            // Why local: the folder's catalog row lives on the server even when it names an SSH target.
            hostRouteForAuthority({
              endpoint: { kind: 'environment', environmentId: runtimeEnvironmentId },
              at: 'local'
            }),
            'folderWorkspace.update',
            { folderWorkspaceId: scope.folderWorkspaceId, updates },
            { timeoutMs: 15_000 }
          )
        ).folderWorkspace
      : await window.api.folderWorkspaces.update({
          folderWorkspaceId: scope.folderWorkspaceId,
          updates
        })
    if (!updated?.[field]) {
      throw new Error('Failed to persist folder workspace review notes')
    }
    return
  }
  const target = runtimeTargetForWorkspaceOwner(state, {
    workspaceId: worktreeId,
    hostId: writeHostId
  })
  if (!target) {
    throw new Error('The workspace host is unresolved; review notes were not saved.')
  }
  if (target.kind === 'local') {
    const meta = await window.api.worktrees.updateMeta({
      worktreeId,
      ...(writeHostId ? { executionHostId: writeHostId } : {}),
      updates: { [field]: notes }
    })
    // Why: main answers null when it refuses or drops the write; reporting success would lose the notes.
    if (!meta) {
      throw new Error('This computer did not save the review notes.')
    }
    return
  }
  if (target.kind === 'environment') {
    await assertHostKeepsField(field, target.environmentId)
  }
  await callRuntimeRpc(
    target,
    'worktree.set',
    { worktree: toRuntimeWorktreeSelector(worktreeId), [field]: notes },
    { timeoutMs: 15_000 }
  )
}
