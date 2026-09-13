import type { GitStatusEntry, GitStatusResult } from '../../shared/git-status-types'
import type { RuntimeFileOpenResult, RuntimeWorktreeRecord } from '../../shared/runtime-types'
import {
  isRuntimePathAbsolute,
  relativePathInsideRoot,
  resolveRuntimePath
} from '../../shared/cross-platform-path'
import { isWslUncPath, parseWslUncPath, toWindowsWslPath } from '../../shared/wsl-paths'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, type RuntimeClient } from '../runtime-client'
import { getOptionalWorktreeSelector, resolveCurrentWorktreeSelector } from '../selectors'

type FileOpenMode = 'edit' | 'diff'
type OpenChangedMode = FileOpenMode | 'both'

type FileOpenRecord = {
  path: string
  mode: FileOpenMode
  staged?: boolean
  opened: boolean
  kind?: RuntimeFileOpenResult['kind']
  skipped?: boolean
  reason?: string
}

type FileOpenChangedResult = {
  worktree: string
  mode: OpenChangedMode
  opened: FileOpenRecord[]
  skipped: FileOpenRecord[]
  totalChanged: number
}

/** `cwdOutsideWorkspace` marks the fallback below, where cwd names no workspace to resolve against. */
type FileCommandWorktree = { worktree: string; cwdOutsideWorkspace: boolean }

async function getFileWorktreeSelector({
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
 * Why: a WSL workspace stores its worktree root as a Windows UNC path while the
 * user types the Linux path they see inside the distro, so the two never match
 * (#11393). Only the distro the caller is sitting in can name that Linux path, and
 * only a UNC root wants the rewrite — a POSIX root already matches, so rewriting
 * it would strand every absolute path.
 *
 * Backslash is a legal Linux filename character but a separator once the path
 * reads as UNC, so `a\b.ts` would relativize to a different file, `a/b.ts`.
 * Such a path has no Windows spelling; leave it to fail the match instead.
 */
function toWorktreeRootPathFlavor(rootPath: string, cwd: string, path: string): string {
  // Why: WSL_DISTRO_NAME reaches this process only if interop forwards it, but the
  // WSL launcher always sets ORCA_CLI_CWD, and its UNC form names the distro itself.
  const distro = process.env.WSL_DISTRO_NAME || parseWslUncPath(cwd)?.distro
  if (
    !distro ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('\\') ||
    !isWslUncPath(rootPath)
  ) {
    return path
  }
  return toWindowsWslPath(path, distro)
}

async function resolveFilePath(
  ctx: HandlerContext,
  worktree: string,
  path: string
): Promise<string> {
  if (!isRuntimePathAbsolute(path)) {
    return path
  }
  // Why: only in-worktree absolute paths should be relativized here; outside paths must reach the runtime guard unchanged.
  const result = await ctx.client.call<{ worktree: RuntimeWorktreeRecord }>('worktree.show', {
    worktree
  })

  const rootPath = result.result.worktree.path
  const relativePath = relativePathInsideRoot(
    rootPath,
    toWorktreeRootPathFlavor(rootPath, ctx.cwd, path)
  )
  if (relativePath === '') {
    throw new RuntimeClientError(
      'invalid_argument',
      'The selected worktree root is a directory, not a file-open target.'
    )
  }
  return relativePath ?? path
}

/**
 * Resolves a relative path against cwd when no workspace encloses cwd.
 *
 * Why cwd and not the selected workspace: that workspace is whichever one the desktop
 * has focused, not one the caller is standing in, so its root would resolve the path
 * somewhere the caller never named. Only reachable where the command fails outright today.
 */
function absoluteWhenCwdOutsideWorkspace(
  cwd: string,
  path: string,
  cwdOutsideWorkspace: boolean
): string {
  return cwdOutsideWorkspace && !isRuntimePathAbsolute(path) ? resolveRuntimePath(cwd, path) : path
}

function getOpenChangedMode(flags: Map<string, string | boolean>): OpenChangedMode {
  const value = flags.get('mode')
  if (flags.has('mode') && (typeof value !== 'string' || value.length === 0)) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Missing value for --mode. Use edit, diff, or both.'
    )
  }
  const mode = getOptionalStringFlag(flags, 'mode') ?? 'diff'
  if (mode === 'edit' || mode === 'diff' || mode === 'both') {
    return mode
  }
  throw new RuntimeClientError('invalid_argument', 'Invalid --mode. Use edit, diff, or both.')
}

function canOpenEntryForEdit(entry: GitStatusEntry): string | null {
  if (entry.status === 'deleted') {
    return 'deleted file has no edit target'
  }
  if (entry.conflictStatus === 'unresolved') {
    return 'unresolved conflict may not have a single editable file'
  }
  return null
}

async function openFileEdit(
  ctx: HandlerContext,
  worktree: string,
  path: string
): Promise<FileOpenRecord> {
  const result = await ctx.client.call<RuntimeFileOpenResult>('files.open', {
    worktree,
    relativePath: path
  })
  return {
    path,
    mode: 'edit',
    opened: result.result.opened,
    kind: result.result.kind,
    ...(result.result.opened ? {} : { skipped: true, reason: `${result.result.kind} file` })
  }
}

async function openFileDiff(
  ctx: HandlerContext,
  worktree: string,
  path: string,
  staged: boolean
): Promise<FileOpenRecord> {
  const result = await ctx.client.call<RuntimeFileOpenResult>('files.openDiff', {
    worktree,
    relativePath: path,
    staged
  })
  return {
    path,
    mode: 'diff',
    staged,
    opened: result.result.opened,
    kind: result.result.kind,
    ...(result.result.opened ? {} : { skipped: true, reason: `${result.result.kind} file` })
  }
}

function formatOpenChangedResult(result: FileOpenChangedResult): string {
  if (result.totalChanged === 0) {
    return 'No changed files.'
  }
  const lines = [`Opened ${result.opened.length} changed file targets.`]
  if (result.skipped.length > 0) {
    lines.push(`Skipped ${result.skipped.length} changed file targets:`)
    for (const skipped of result.skipped) {
      lines.push(`- ${skipped.path}: ${skipped.reason ?? 'not opened'}`)
    }
  }
  return lines.join('\n')
}

function formatFileOpen(result: RuntimeFileOpenResult): string {
  return result.opened
    ? `Opened ${result.relativePath}.`
    : `Did not open ${result.relativePath}: ${result.kind} file.`
}

function formatFileDiff(result: RuntimeFileOpenResult): string {
  return result.opened
    ? `Opened diff for ${result.relativePath}.`
    : `Did not open diff for ${result.relativePath}: ${result.kind} file.`
}

export const FILE_HANDLERS: Record<string, CommandHandler> = {
  'file open': async (ctx) => {
    const path = getRequiredStringFlag(ctx.flags, 'path')
    const { worktree, cwdOutsideWorkspace } = await getFileWorktreeSelector(ctx)
    const relativePath = await resolveFilePath(
      ctx,
      worktree,
      absoluteWhenCwdOutsideWorkspace(ctx.cwd, path, cwdOutsideWorkspace)
    )
    const result = await ctx.client.call<RuntimeFileOpenResult>('files.open', {
      worktree,
      relativePath
    })
    printResult(result, ctx.json, formatFileOpen)
  },
  'file diff': async (ctx) => {
    const path = getRequiredStringFlag(ctx.flags, 'path')
    const staged = ctx.flags.get('staged') === true
    const { worktree } = await getFileWorktreeSelector(ctx)
    const relativePath = await resolveFilePath(ctx, worktree, path)
    const result = await ctx.client.call<RuntimeFileOpenResult>('files.openDiff', {
      worktree,
      relativePath,
      staged
    })
    printResult(result, ctx.json, formatFileDiff)
  },
  'file open-changed': async (ctx) => {
    const mode = getOpenChangedMode(ctx.flags)
    const { worktree } = await getFileWorktreeSelector(ctx)
    const status = await ctx.client.call<GitStatusResult>('git.status', { worktree })
    const opened: FileOpenRecord[] = []
    const skipped: FileOpenRecord[] = []
    const openedEditPaths = new Set<string>()

    for (const entry of status.result.entries) {
      if (mode === 'edit' || mode === 'both') {
        const editSkipReason = canOpenEntryForEdit(entry)
        if (editSkipReason) {
          skipped.push({
            path: entry.path,
            mode: 'edit',
            opened: false,
            skipped: true,
            reason: editSkipReason
          })
        } else if (!openedEditPaths.has(entry.path)) {
          openedEditPaths.add(entry.path)
          const record = await openFileEdit(ctx, worktree, entry.path)
          const records = record.opened ? opened : skipped
          records.push(record)
        }
      }

      if (mode === 'diff' || mode === 'both') {
        const staged = entry.area === 'staged'
        if (entry.conflictStatus === 'unresolved') {
          skipped.push({
            path: entry.path,
            mode: 'diff',
            staged,
            opened: false,
            skipped: true,
            reason: 'unresolved conflict may not have a single diff target'
          })
        } else {
          const record = await openFileDiff(ctx, worktree, entry.path, staged)
          const records = record.opened ? opened : skipped
          records.push(record)
        }
      }
    }

    printResult(
      {
        ...status,
        result: {
          worktree,
          mode,
          opened,
          skipped,
          totalChanged: status.result.entries.length
        }
      },
      ctx.json,
      formatOpenChangedResult
    )
  }
}
