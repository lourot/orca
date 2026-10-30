import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { getConnectionId } from '@/lib/connection-context'
import { resolveOwner } from '@/lib/resolve-owner'
import { getRuntimeRepoBaseRefDefault } from '@/runtime/runtime-repo-client'
import { installWindowVisibilityTimeoutPoller } from '@/lib/window-visibility-timeout-poller'
import {
  LOCAL_EXECUTION_HOST_ID,
  toRuntimeExecutionHostId
} from '../../../../../../shared/execution-host'
import type { GitBaseDivergence } from '../../../../../../shared/git-diff-compare-types'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import {
  probeFirstResolvingBase,
  selectBaseDivergenceTargets
} from './worktree-base-divergence-targets'

export type WorktreeBaseDivergence = GitBaseDivergence & { baseRef: string }

const EMPTY_DIVERGENCE_MAP: ReadonlyMap<string, WorktreeBaseDivergence> = new Map()

export const WORKTREE_BASE_DIVERGENCE_SWEEP_INTERVAL_MS = 60_000

/** Commits each non-primary local worktree is ahead of and behind its base ref, for the
 *  sidebar cards. Modelled on the dirty sweep (`useProjectUncommittedChanges`). */
export function useWorktreeBaseDivergence(args: {
  worktrees: readonly Worktree[]
  repoMap: ReadonlyMap<string, Repo>
}): ReadonlyMap<string, WorktreeBaseDivergence> {
  const { worktrees, repoMap } = args
  const [divergenceByWorktreeId, setDivergenceByWorktreeId] =
    useState<ReadonlyMap<string, WorktreeBaseDivergence>>(EMPTY_DIVERGENCE_MAP)

  // Why refs: the sweep must read the latest rows without reinstalling the poller.
  const inputsRef = useRef({ worktrees, repoMap })
  inputsRef.current = { worktrees, repoMap }
  const divergenceRef = useRef(divergenceByWorktreeId)
  divergenceRef.current = divergenceByWorktreeId

  const membershipKey = useMemo(
    () =>
      worktrees
        .map((worktree) => {
          const repo = repoMap.get(worktree.repoId)
          return [
            worktree.id,
            worktree.path,
            worktree.repoId,
            worktree.baseRef ?? '',
            repo?.kind ?? '',
            repo?.connectionId ?? '',
            repo?.worktreeBaseRef ?? ''
          ].join('\0')
        })
        .sort()
        .join('\n'),
    [worktrees, repoMap]
  )

  const sweep = useCallback(async (signal: AbortSignal): Promise<void> => {
    const state = useAppStore.getState()
    const targets = selectBaseDivergenceTargets({
      worktrees: inputsRef.current.worktrees,
      repoMap: inputsRef.current.repoMap,
      getExecutionHostId: (worktreeId) => {
        const owner = resolveOwner(state, { workspaceId: worktreeId })
        if (owner.kind !== 'resolved') {
          return null
        }
        const { endpoint, at } = owner.owner
        return endpoint.kind === 'self' ? at : toRuntimeExecutionHostId(endpoint.environmentId)
      }
    })
    const defaultBaseRefByRepoId = new Map<string, Promise<string | null>>()
    const resolveDefaultBaseRef = (repoId: string): Promise<string | null> => {
      let pending = defaultBaseRefByRepoId.get(repoId)
      if (!pending) {
        // Why no catch: a failed lookup must keep the previous counts, not read as "no default".
        pending = getRuntimeRepoBaseRefDefault(LOCAL_EXECUTION_HOST_ID, repoId).then(
          (result) => result.defaultBaseRef
        )
        defaultBaseRefByRepoId.set(repoId, pending)
      }
      return pending
    }
    const probed = new Map<string, WorktreeBaseDivergence>()
    await Promise.all(
      targets.map(async (target) => {
        // Why keep the previous value on failure: an unanswered probe is not "level with base".
        const keepPrevious = (): void => {
          const previous = divergenceRef.current.get(target.worktreeId)
          if (previous) {
            probed.set(target.worktreeId, previous)
          }
        }
        try {
          const divergence = await probeFirstResolvingBase({
            pinnedBaseRefs: target.pinnedBaseRefs,
            resolveDefaultBaseRef: () => resolveDefaultBaseRef(target.repoId),
            probe: async (baseRef) => {
              // Why throw, not null: null would walk on to the next base.
              signal.throwIfAborted()
              return window.api.git.baseDivergence({
                worktreePath: target.worktreePath,
                baseRef,
                connectionId: getConnectionId(target.worktreeId) ?? undefined
              })
            }
          })
          if (divergence) {
            probed.set(target.worktreeId, divergence)
          }
        } catch {
          keepPrevious()
        }
      })
    )
    if (signal.aborted) {
      return
    }
    setDivergenceByWorktreeId(probed)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const dispose = installWindowVisibilityTimeoutPoller({
      run: () => sweep(controller.signal),
      getDelayMs: () => WORKTREE_BASE_DIVERGENCE_SWEEP_INTERVAL_MS
    })
    return () => {
      controller.abort()
      dispose()
    }
  }, [membershipKey, sweep])

  return divergenceByWorktreeId
}
