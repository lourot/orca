import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { getConnectionId } from '@/lib/connection-context'
import {
  getExecutionHostIdForWorktree,
  getSettingsForWorktreeRuntimeOwner
} from '@/lib/worktree-runtime-owner'
import { getRuntimeGitStatus } from '@/runtime/runtime-git-client'
import { installWindowVisibilityTimeoutPoller } from '@/lib/window-visibility-timeout-poller'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import {
  aggregateDirtyRepoIds,
  selectDirtyWorktreeIds,
  selectProjectUncommittedProbeTargets
} from './project-uncommitted-changes-targets'

const EMPTY_DIRTY_MAP: ReadonlyMap<string, boolean> = new Map()

export const PROJECT_UNCOMMITTED_CHANGES_SWEEP_INTERVAL_MS = 30_000

/** Tracks which local worktrees have uncommitted changes, rolled up per project.
 *  The project set lets a collapsed header say so without being expanded; the
 *  worktree set lets the expanded rows say which one it is.
 *
 *  The probe reuses the ordinary status read rather than a cheaper bespoke one:
 *  `getStatus` drops the untracked shared symlinks Orca links into every worktree
 *  (linked `node_modules` and friends), and that drop runs *after* parsing — so an
 *  early-stopped read would report those worktrees dirty forever. `includeLineStats:
 *  false` skips the expensive part, and the 'background' admission tier keeps the
 *  sweep behind interactive git work.
 */
export function useProjectUncommittedChanges(args: {
  worktrees: readonly Worktree[]
  repoMap: ReadonlyMap<string, Repo>
}): { dirtyRepoIds: ReadonlySet<string>; dirtyWorktreeIds: ReadonlySet<string> } {
  const { worktrees, repoMap } = args
  const [dirtyByWorktreeId, setDirtyByWorktreeId] =
    useState<ReadonlyMap<string, boolean>>(EMPTY_DIRTY_MAP)

  // Why refs: the sweep must read the latest rows without making every render
  // reinstall the poller (which would restart the interval and re-probe).
  const inputsRef = useRef({ worktrees, repoMap })
  inputsRef.current = { worktrees, repoMap }
  const dirtyRef = useRef(dirtyByWorktreeId)
  dirtyRef.current = dirtyByWorktreeId

  // Re-sweep promptly when the eligible set changes shape, not on every render.
  const membershipKey = useMemo(
    () =>
      worktrees
        .map((worktree) => {
          const repo = repoMap.get(worktree.repoId)
          return [
            worktree.id,
            worktree.path,
            worktree.repoId,
            repo?.kind ?? '',
            repo?.connectionId ?? ''
          ].join('\0')
        })
        .sort()
        .join('\n'),
    [worktrees, repoMap]
  )

  const sweep = useCallback(async (signal: AbortSignal): Promise<void> => {
    const state = useAppStore.getState()
    const targets = selectProjectUncommittedProbeTargets({
      worktrees: inputsRef.current.worktrees,
      repoMap: inputsRef.current.repoMap,
      getExecutionHostId: (worktreeId) => getExecutionHostIdForWorktree(state, worktreeId)
    })
    const probed = new Map<string, boolean>()
    await Promise.all(
      targets.map(async (target) => {
        try {
          const status = await getRuntimeGitStatus(
            {
              settings: getSettingsForWorktreeRuntimeOwner(state, target.worktreeId),
              worktreeId: target.worktreeId,
              worktreePath: target.worktreePath,
              connectionId: getConnectionId(target.worktreeId) ?? undefined
            },
            { admissionTier: 'background', includeLineStats: false, signal }
          )
          probed.set(target.worktreeId, status.entries.length > 0)
        } catch {
          // Why keep the previous verdict: a failed or aborted probe is not
          // evidence of a clean tree, and clearing the dot would read as one.
          const previous = dirtyRef.current.get(target.worktreeId)
          if (previous !== undefined) {
            probed.set(target.worktreeId, previous)
          }
        }
      })
    )
    if (signal.aborted) {
      return
    }
    setDirtyByWorktreeId(probed)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    // Runs on mount, on window focus and on visibilitychange, then re-arms the
    // interval only after the previous sweep settles.
    const dispose = installWindowVisibilityTimeoutPoller({
      run: () => sweep(controller.signal),
      getDelayMs: () => PROJECT_UNCOMMITTED_CHANGES_SWEEP_INTERVAL_MS
    })
    return () => {
      controller.abort()
      dispose()
    }
  }, [membershipKey, sweep])

  const dirtyRepoIds = useMemo(
    () => aggregateDirtyRepoIds(worktrees, dirtyByWorktreeId),
    [worktrees, dirtyByWorktreeId]
  )
  const dirtyWorktreeIds = useMemo(
    () => selectDirtyWorktreeIds(dirtyByWorktreeId),
    [dirtyByWorktreeId]
  )
  return useMemo(() => ({ dirtyRepoIds, dirtyWorktreeIds }), [dirtyRepoIds, dirtyWorktreeIds])
}
