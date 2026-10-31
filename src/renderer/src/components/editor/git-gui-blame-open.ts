import { toast } from 'sonner'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { translate } from '@/i18n/i18n'
import { showLocalPathOpenBlockedToast } from '@/lib/local-path-open-guard'

/** Opens git's blame browser on `filePath`; main refuses anything not on this computer. */
export async function openFileInGitGuiBlame(
  filePath: string,
  worktreePath: string,
  ownerHostId: ExecutionHostId | 'unresolved'
): Promise<void> {
  const open = window.api.shell.openGitGuiBlame
  if (!open || ownerHostId === 'unresolved') {
    showLocalPathOpenBlockedToast()
    return
  }
  const result = await open({ filePath, worktreePath, ownerHostId })
  if (result.ok) {
    return
  }
  if (result.reason === 'remote-runtime-unsupported') {
    showLocalPathOpenBlockedToast()
    return
  }
  toast.error(
    result.reason === 'launch-failed'
      ? translate(
          'editor.gitGuiBlame.launchFailed',
          'Could not start git gui. Check that it is installed (`git gui` from a terminal).'
        )
      : translate('editor.gitGuiBlame.notInWorktree', 'This file is not inside its git worktree.')
  )
}
