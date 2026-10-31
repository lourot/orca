import { isAbsolute, relative } from 'node:path'
import { ipcMain } from 'electron'
import { spawnProcess } from '@orca/process-host'
import type { GitGuiBlameRequest, GitGuiBlameResult } from '../../shared/git-gui-blame-types'
import { isLocallyOwned, validateLocalPathTarget } from './shell-owned-path-target'

// git exits at once when `git gui` is missing; a running blame window means it started.
const STARTUP_GRACE_MS = 1500

/** Opens git's Tk blame browser on a local file, run from its worktree so it gets a relative path. */
export async function openGitGuiBlame(
  request: GitGuiBlameRequest,
  startupGraceMs = STARTUP_GRACE_MS
): Promise<GitGuiBlameResult> {
  if (!isLocallyOwned(request.ownerHostId)) {
    return { ok: false, reason: 'remote-runtime-unsupported' }
  }
  const worktree = await validateLocalPathTarget(request.worktreePath)
  if (!worktree.ok) {
    return worktree
  }
  const file = await validateLocalPathTarget(request.filePath)
  if (!file.ok) {
    return file
  }
  const relativePath = relative(worktree.path, file.path)
  if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return { ok: false, reason: 'outside-worktree' }
  }
  return await new Promise((resolveLaunch) => {
    const child = spawnProcess({
      program: 'git',
      args: ['gui', 'blame', relativePath],
      cwd: worktree.path,
      detached: true,
      stdio: 'ignore'
    })
    const timer = setTimeout(() => {
      child.unref()
      resolveLaunch({ ok: true })
    }, startupGraceMs)
    const fail = (): void => {
      clearTimeout(timer)
      resolveLaunch({ ok: false, reason: 'launch-failed' })
    }
    child.once('error', fail)
    child.once('exit', (code) => (code === 0 ? undefined : fail()))
  })
}

export function registerGitGuiBlameHandler(): void {
  ipcMain.handle(
    'shell:openGitGuiBlame',
    (_event, request: GitGuiBlameRequest): Promise<GitGuiBlameResult> => openGitGuiBlame(request)
  )
}
