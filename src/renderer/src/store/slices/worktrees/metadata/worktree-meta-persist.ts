import { assertWorkspaceAttachmentWriteCapability } from '../../../../runtime/runtime-workspace-attachment-capabilities'
import type { WorkspaceAttachmentMutation } from '../../../../../../shared/workspace-attachment-mutation'
import { getLegacyWorkspaceReviewSelectionUpdates } from '../../../../../../shared/workspace-attachment-legacy'
import { WORKTREE_LINKED_ITEMS_RUNTIME_CAPABILITY } from '../../../../../../shared/workspace-attachment-capabilities'
import {
  assertRuntimeEnvironmentCapability,
  callRuntimeRpc,
  runtimeEnvironmentSupportsCapability
} from '../../../../runtime/runtime-rpc-client'
import {
  TASK_SOURCE_CONTEXT_RUNTIME_CAPABILITY,
  WORKTREE_RENAME_ERROR_DISMISS_RUNTIME_CAPABILITY,
  WORKTREE_GITHUB_PR_SUPPRESSION_RUNTIME_CAPABILITY,
  WORKTREE_LINKED_WORK_ITEM_CONTEXT_RUNTIME_CAPABILITY
} from '../../../../../../shared/protocol-version'
import { toRuntimeWorktreeSelector } from '../../../../runtime/runtime-worktree-selector'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '../../../../../../shared/runtime-client-target'
import type { WorktreeMeta } from '../../../../../../shared/worktree/meta-types'
import type { ExecutionHostId } from '../../../../../../shared/execution-host'
import { encodePushTargetClearForRuntimeRpc } from './hosted-review-link-mutation'

type PendingMetaWrite = {
  worktreeId: string
  executionHostId?: ExecutionHostId
}

// Why per field: the fetched-worktree merge asks per field whether a write is still in flight, so
// a refresh that joined a listing captured before the write cannot restore the old value.
const pendingDisplayNameWrites = new Set<PendingMetaWrite>()
const pendingColorTagWrites = new Set<PendingMetaWrite>()

function pendingWriteMatches(
  write: PendingMetaWrite,
  worktreeId: string,
  executionHostId?: ExecutionHostId
): boolean {
  return (
    write.worktreeId === worktreeId &&
    (write.executionHostId === undefined ||
      executionHostId === undefined ||
      write.executionHostId === executionHostId)
  )
}

function hasPendingWrite(
  writes: ReadonlySet<PendingMetaWrite>,
  worktreeId: string,
  executionHostId?: ExecutionHostId
): boolean {
  for (const write of writes) {
    if (pendingWriteMatches(write, worktreeId, executionHostId)) {
      return true
    }
  }
  return false
}

export function isDisplayNamePersistencePending(
  worktreeId: string,
  executionHostId?: ExecutionHostId
): boolean {
  return hasPendingWrite(pendingDisplayNameWrites, worktreeId, executionHostId)
}

export function isColorTagPersistencePending(
  worktreeId: string,
  executionHostId?: ExecutionHostId
): boolean {
  return hasPendingWrite(pendingColorTagWrites, worktreeId, executionHostId)
}

/** Test-only: both trackers are module-level and would otherwise leak from one test into the next. */
export function resetWorktreeMetaWriteTrackingForTests(): void {
  pendingDisplayNameWrites.clear()
  pendingColorTagWrites.clear()
}

function trackPendingWrite(
  writes: Set<PendingMetaWrite>,
  operation: Promise<void>,
  worktreeId: string,
  executionHostId?: ExecutionHostId
): void {
  const write: PendingMetaWrite = { worktreeId, executionHostId }
  writes.add(write)
  void operation.then(
    () => writes.delete(write),
    () => writes.delete(write)
  )
}

export function persistWorktreeMeta(
  target: RuntimeClientTarget,
  worktreeId: string,
  updates: Partial<WorktreeMeta> & WorkspaceAttachmentMutation,
  executionHostId?: ExecutionHostId,
  identityKey?: string
): Promise<void> {
  const operation = persistWorktreeMetaUntracked(
    target,
    worktreeId,
    updates,
    executionHostId,
    identityKey
  )
  if ('displayName' in updates) {
    trackPendingWrite(pendingDisplayNameWrites, operation, worktreeId, executionHostId)
  }
  if ('colorTag' in updates) {
    trackPendingWrite(pendingColorTagWrites, operation, worktreeId, executionHostId)
  }
  return operation
}

async function persistWorktreeMetaUntracked(
  target: RuntimeClientTarget,
  worktreeId: string,
  updates: Partial<WorktreeMeta> & WorkspaceAttachmentMutation,
  executionHostId?: ExecutionHostId,
  identityKey?: string
): Promise<void> {
  if (target.kind === 'local') {
    await window.api.worktrees.updateMeta({
      worktreeId,
      ...(executionHostId ? { executionHostId } : {}),
      updates: updates
    })
    return
  }
  await assertWorkspaceAttachmentWriteCapability(target, updates)
  if (updates.firstAgentMessageRenameError === null && updates.displayName === undefined) {
    await assertRuntimeEnvironmentCapability(
      target.environmentId,
      WORKTREE_RENAME_ERROR_DISMISS_RUNTIME_CAPABILITY,
      translate(
        'auto.store.slices.worktrees.metadata.worktree.meta.persist.dismissRenameError',
        'Update the remote runtime to dismiss auto-name errors'
      )
    )
  }
  // Old worktree.set strips unknown keys, including clears; gate by presence so dropped fields cannot strand hidden review links.
  if (
    target.kind === 'environment' &&
    ('linkedWorkItem' in updates || 'linkedTaskSourceContext' in updates)
  ) {
    await assertRuntimeEnvironmentCapability(
      target.environmentId,
      WORKTREE_LINKED_WORK_ITEM_CONTEXT_RUNTIME_CAPABILITY,
      translate(
        'auto.store.slices.worktrees.metadata.worktree.meta.persist.877e3638d8',
        'Update the remote runtime to change this workspace’s linked issue'
      )
    )
  }
  // task-source-context.v1 is a sound proxy for the Linear keys: #5322 added them
  // to the schema and is an ancestor of the commit introducing that capability.
  if (target.kind === 'environment' && 'linkedLinearIssue' in updates) {
    await assertRuntimeEnvironmentCapability(
      target.environmentId,
      TASK_SOURCE_CONTEXT_RUNTIME_CAPABILITY,
      translate(
        'auto.store.slices.worktrees.metadata.worktree.meta.persist.4367540861',
        'Update the remote runtime to link Linear issues'
      )
    )
  }
  let compatibleUpdates = updates
  const legacySelection = getLegacyWorkspaceReviewSelectionUpdates(updates)
  if (
    legacySelection !== updates &&
    target.kind === 'environment' &&
    !(await runtimeEnvironmentSupportsCapability(
      target.environmentId,
      WORKTREE_LINKED_ITEMS_RUNTIME_CAPABILITY
    ))
  ) {
    compatibleUpdates = legacySelection
  }
  if (target.kind === 'environment' && 'suppressedGitHubPR' in updates) {
    if (typeof updates.suppressedGitHubPR === 'number' && updates.suppressedGitHubPR > 0) {
      await assertRuntimeEnvironmentCapability(
        target.environmentId,
        WORKTREE_GITHUB_PR_SUPPRESSION_RUNTIME_CAPABILITY,
        translate(
          'auto.store.slices.worktrees.metadata.worktree.meta.persist.github.pr.suppression',
          'Update the remote runtime to unlink GitHub pull requests'
        )
      )
    } else if (
      updates.suppressedGitHubPR === null &&
      !(await runtimeEnvironmentSupportsCapability(
        target.environmentId,
        WORKTREE_GITHUB_PR_SUPPRESSION_RUNTIME_CAPABILITY
      ))
    ) {
      const olderHostUpdates = { ...compatibleUpdates }
      delete olderHostUpdates.suppressedGitHubPR
      compatibleUpdates = olderHostUpdates
    }
  }
  await callRuntimeRpc(
    target,
    'worktree.set',
    {
      worktree: identityKey ? `identity:${identityKey}` : toRuntimeWorktreeSelector(worktreeId),
      ...encodePushTargetClearForRuntimeRpc(compatibleUpdates)
    },
    { timeoutMs: 15_000 }
  )
}
