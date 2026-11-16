import { defineMethod } from '../core'

export const WORKTREE_RESOLVE_ACTIVE_METHOD = defineMethod({
  name: 'worktree.resolveActive',
  permission: 'workspace',
  params: null,
  // Why not a selector: `active` means the desktop's focus, which only this host knows, so a
  // caller with no cwd inside a workspace has nothing to name. Null when nothing is focused.
  handler: async (_params, { runtime }) => ({
    worktree: (await runtime.resolveActiveWorktreeContext())?.worktreeId ?? null
  })
})
