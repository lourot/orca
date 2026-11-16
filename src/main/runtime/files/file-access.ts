import type { RuntimeFileOpenPosition } from '../../../shared/runtime-file-contracts'
import { listFilesystemMarkdownDocuments } from '../../providers/filesystem-markdown-listing'
import type { MarkdownDocument } from '../../../shared/filesystem-entry-types'
import {
  validatePathExistenceBatch,
  type PathExistenceResult
} from '../../../shared/path-existence-batch'
import { readRuntimeFilePathExistence } from './file-path-existence'
import {
  isMobileBinaryPath,
  isMobileMarkdownPath,
  isSafeMobileRelativePath,
  isMobilePreviewableImagePath
} from './mobile-file-kind'
import type { RuntimeFileCommandHost } from './file-command-host'
import type { RuntimeFileOpenResult } from '../../../shared/runtime-types'
import type { RuntimeNavigationTarget } from '../../../shared/runtime-navigation'
import { joinWorktreeRelativePath } from '../runtime-relative-paths'
import { isENOENT } from '../../ipc/filesystem/filesystem-path-containment'
import {
  requireRuntimeFileProvider,
  resolveFileExplorerPath,
  resolveFileExplorerPaths
} from './file-target'
import { stat } from 'node:fs/promises'
import { isRuntimePathAbsolute, relativePathInsideRoot } from '../../../shared/cross-platform-path'
import { validateExternalOpenPath } from '../../../shared/external-file-open-path'
import { assertExternalOpenAllowed } from '../runtime-file-external-open'
import { parseExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import type { FileStat } from '../../providers/filesystem-provider-contract'
import { assertRuntimeReadWslDistroRunning } from '../runtime-wsl-background-read-gate'

type RuntimeFileAccessHost = Pick<
  RuntimeFileCommandHost,
  'requireStore' | 'resolveRuntimeFileTarget' | 'openFile' | 'openDiff'
>

export class RuntimeFileAccess {
  constructor(private readonly host: RuntimeFileAccessHost) {}

  async openMobileFile(
    worktreeSelector: string,
    relativePath: string,
    navigation?: RuntimeNavigationTarget,
    position?: RuntimeFileOpenPosition,
    options: { allowOutsideWorkspace?: boolean } = {}
  ): Promise<RuntimeFileOpenResult> {
    const target = await this.host.resolveRuntimeFileTarget(worktreeSelector)
    const { worktree } = target
    // An absolute path inside the root names the same file as its relative spelling, so only a
    // genuinely outside one takes the external flow. Dots fold first, or `<root>/../etc/x` would
    // read as inside.
    const absolutePath = isRuntimePathAbsolute(relativePath)
      ? validateExternalOpenPath(relativePath)
      : null
    const insideRoot =
      absolutePath === null ? relativePath : relativePathInsideRoot(worktree.path, absolutePath)
    if (insideRoot === '') {
      throw new Error('The selected workspace root is a directory, not a file-open target.')
    }
    if (absolutePath !== null && insideRoot === null) {
      assertExternalOpenAllowed({
        allowOutsideWorkspace: options.allowOutsideWorkspace === true,
        hostIsLocal: parseExecutionHostId(target.executionHostId)?.kind === 'local',
        worktreePath: worktree.path
      })
      return await this.openExternalFile(worktree.id, absolutePath, navigation, position)
    }
    // Why the null: only an absolute path can miss the root, and that case returned above.
    if (insideRoot === null || !isSafeMobileRelativePath(insideRoot)) {
      throw new Error('invalid_relative_path')
    }
    // File kind does not limit the desktop editor: binaries such as PDFs can open too.
    const kind = mobileOpenFileKind(insideRoot)
    const filePath = joinWorktreeRelativePath(worktree.path, insideRoot)
    // Reject missing paths/directories before clients treat opened:true as success.
    await this.assertOpenTargetIsFile(filePath, target)
    await this.host.openFile(
      worktree.id,
      filePath,
      insideRoot,
      runtimeOwnerForTarget(target),
      navigation,
      ...(position ? [position] : [])
    )
    return { worktree: worktree.id, relativePath: insideRoot, kind, opened: true }
  }

  /**
   * Opens a local path that belongs to no workspace. The tab stores the absolute path as its
   * relative path too, which is what makes the renderer read and save it as a user-named file.
   */
  private async openExternalFile(
    worktreeId: string,
    absolutePath: string,
    navigation?: RuntimeNavigationTarget,
    position?: RuntimeFileOpenPosition
  ): Promise<RuntimeFileOpenResult> {
    let stats: Awaited<ReturnType<typeof stat>>
    try {
      stats = await stat(absolutePath)
    } catch (error) {
      if (isENOENT(error)) {
        throw new Error(`ENOENT: no such file or directory, open '${absolutePath}'`)
      }
      throw error
    }
    if (stats.isDirectory()) {
      throw new Error(`Cannot open a directory: ${absolutePath}`)
    }
    // Why null owner: assertExternalOpenAllowed only lets local workspaces through.
    this.host.openFile(
      worktreeId,
      absolutePath,
      absolutePath,
      null,
      navigation,
      ...(position ? [position] : [])
    )
    return {
      worktree: worktreeId,
      relativePath: absolutePath,
      kind: mobileOpenFileKind(absolutePath),
      opened: true,
      outsideWorkspace: true
    }
  }

  private async assertOpenTargetIsFile(
    filePath: string,
    target: { executionHostId: ExecutionHostId }
  ): Promise<void> {
    let stats: FileStat
    try {
      stats = await requireRuntimeFileProvider(target, this.host).stat(filePath)
    } catch (error) {
      if (isENOENT(error)) {
        throw new Error(`ENOENT: no such file or directory, open '${filePath}'`)
      }
      throw error
    }
    if (stats.type === 'directory') {
      throw new Error(`EISDIR: illegal operation on a directory, open '${filePath}'`)
    }
  }

  async openMobileDiff(
    worktreeSelector: string,
    relativePath: string,
    staged: boolean,
    navigation?: RuntimeNavigationTarget
  ): Promise<RuntimeFileOpenResult> {
    const target = await this.host.resolveRuntimeFileTarget(worktreeSelector)
    const { worktree } = target
    if (!isSafeMobileRelativePath(relativePath)) {
      throw new Error('invalid_relative_path')
    }
    const kind = isMobileBinaryPath(relativePath)
      ? 'binary'
      : isMobileMarkdownPath(relativePath)
        ? 'markdown'
        : 'text'
    const filePath = joinWorktreeRelativePath(worktree.path, relativePath)
    this.host.openDiff(
      worktree.id,
      filePath,
      relativePath,
      staged,
      runtimeOwnerForTarget(target),
      navigation
    )
    return { worktree: worktree.id, relativePath, kind, opened: true }
  }

  async listRuntimeMarkdownDocuments(worktreeSelector: string): Promise<MarkdownDocument[]> {
    const target = await this.host.resolveRuntimeFileTarget(worktreeSelector)
    return listFilesystemMarkdownDocuments(
      requireRuntimeFileProvider(target, this.host),
      target.worktree.path
    )
  }

  async pathsExistRuntimeFiles(
    worktreeSelector: string,
    relativePaths: string[]
  ): Promise<PathExistenceResult[]> {
    validatePathExistenceBatch(relativePaths)
    const targets = await resolveFileExplorerPaths(this.host, worktreeSelector, relativePaths)
    // Link checks on render and retry timers: never start a stopped WSL distro (E9).
    if (targets[0]) {
      await assertRuntimeReadWslDistroRunning(targets[0])
    }
    return readRuntimeFilePathExistence(targets, this.host)
  }

  async statRuntimeFile(
    worktreeSelector: string,
    relativePath: string
  ): Promise<{ size: number; isDirectory: boolean; mtime: number; ctime?: number }> {
    const target = await resolveFileExplorerPath(this.host, worktreeSelector, relativePath)
    const fileStat = await requireRuntimeFileProvider(target, this.host).stat(target.path)
    return {
      size: fileStat.size,
      isDirectory: fileStat.type === 'directory',
      mtime: fileStat.mtime,
      ...(fileStat.ctimeMs === undefined ? {} : { ctime: fileStat.ctimeMs })
    }
  }
}

/** Previewable images open like text (mobile renders via files.readPreview). */
function mobileOpenFileKind(path: string): RuntimeFileOpenResult['kind'] {
  if (isMobilePreviewableImagePath(path)) {
    return 'image'
  }
  if (isMobileBinaryPath(path)) {
    return 'binary'
  }
  return isMobileMarkdownPath(path) ? 'markdown' : 'text'
}

function runtimeOwnerForTarget(target: { executionHostId: ExecutionHostId }): string | null {
  const host = parseExecutionHostId(target.executionHostId)
  return host?.kind === 'runtime' ? host.environmentId : null
}
