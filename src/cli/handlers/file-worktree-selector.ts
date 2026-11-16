import { isRuntimePathAbsolute, resolveRuntimePath } from '../../shared/cross-platform-path'
import type { HandlerContext } from '../dispatch'
import { RuntimeClientError, type RuntimeClient } from '../runtime-client'
import { getOptionalWorktreeSelector, resolveCurrentWorktreeSelector } from '../selectors'

/** `cwdOutsideWorkspace` marks the fallback below, where cwd names no workspace to resolve against. */
type FileCommandWorktree = { worktree: string; cwdOutsideWorkspace: boolean }

export async function getFileWorktreeSelector({
  flags,
  cwd,
  client
}: HandlerContext): Promise<FileCommandWorktree> {
  const worktree = flags.get('worktree')
  if (flags.has('worktree') && (typeof worktree !== 'string' || worktree.length === 0)) {
    throw new RuntimeClientError('invalid_argument', 'Missing value for --worktree.')
  }
  const explicit = await getOptionalWorktreeSelector(flags, 'worktree', cwd, client)
  if (explicit) {
    return { worktree: explicit, cwdOutsideWorkspace: false }
  }
  if (client.isRemote) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Remote file commands require --worktree because the client cwd cannot identify a server worktree.'
    )
  }
  try {
    return {
      worktree: await resolveCurrentWorktreeSelector(cwd, client),
      cwdOutsideWorkspace: false
    }
  } catch (error) {
    if (!isSelectorNotFoundError(error)) {
      throw error
    }
    return {
      worktree: await resolveFocusedWorktreeSelector(client, error),
      cwdOutsideWorkspace: true
    }
  }
}

/**
 * Why structural rather than `instanceof`: `RuntimeClientError` reaches this module
 * through a barrel, so a second copy of the class compares false against a thrown one.
 */
function isSelectorNotFoundError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && 'code' in error && error.code === 'selector_not_found'
}

/**
 * Falls back to the workspace the desktop has focused, so a file that belongs to no
 * workspace still has one to host its editor tab.
 *
 * A host without the method answers `method_not_found`, which reads here the same as
 * nothing being focused: the original cwd error, with what to do about it.
 */
async function resolveFocusedWorktreeSelector(
  client: RuntimeClient,
  cwdError: Error
): Promise<string> {
  const focused = await client
    .call<{ worktree: string | null }>('worktree.resolveActive', {})
    .catch(() => null)
  const worktreeId = focused?.result.worktree
  if (!worktreeId) {
    throw new RuntimeClientError(
      'selector_not_found',
      `${cwdError.message}. Pass --worktree <selector>, or focus a workspace in Orca.`
    )
  }
  return `id:${worktreeId}`
}

/**
 * Resolves a relative path against cwd when no workspace encloses cwd.
 *
 * Why cwd and not the selected workspace: that workspace is whichever one the desktop
 * has focused, not one the caller is standing in, so its root would resolve the path
 * somewhere the caller never named. Only reachable where the command fails outright today.
 */
export function absoluteWhenCwdOutsideWorkspace(
  cwd: string,
  path: string,
  cwdOutsideWorkspace: boolean
): string {
  return cwdOutsideWorkspace && !isRuntimePathAbsolute(path) ? resolveRuntimePath(cwd, path) : path
}
