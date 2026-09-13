import { isWslUncPath } from '../../shared/wsl-paths'
import type { RuntimeFileRoute } from './runtime-file-command-target'

export const EXTERNAL_OPEN_PAIRED_CLIENT_MESSAGE =
  'Opening a file outside the workspace is available to a local Orca CLI only.'

export const EXTERNAL_OPEN_NON_LOCAL_WORKSPACE_MESSAGE =
  'Opening a file outside the workspace is supported only for local workspaces; this one runs on a remote or WSL host.'

/**
 * Gates an open target that resolved outside every workspace root.
 *
 * A workspace-relative open is bounded by the root, so `files.open` can be on the
 * paired-client allowlist. An external one is not, and the path it names belongs
 * to whichever machine hosts the workspace — so it stays with callers that already
 * run there as the user, and with hosts this process can reach directly.
 */
export function assertExternalOpenAllowed(args: {
  allowOutsideWorkspace: boolean
  route: RuntimeFileRoute
  worktreePath: string
}): void {
  if (!args.allowOutsideWorkspace) {
    throw new Error(EXTERNAL_OPEN_PAIRED_CLIENT_MESSAGE)
  }
  if (args.route.kind !== 'local' || isWslUncPath(args.worktreePath)) {
    throw new Error(EXTERNAL_OPEN_NON_LOCAL_WORKSPACE_MESSAGE)
  }
}
