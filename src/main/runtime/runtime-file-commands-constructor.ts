// @ts-nocheck -- mechanically split class members.
import {
  RuntimeFileCommandsWithActiveRuntimeTextSearches,
  RuntimeFileCommandsWithActiveRuntimeTextSearches as RuntimeFileCommands
} from './runtime-file-commands-active-runtime-text-searches'
import type { RuntimeFileCommandHost } from './runtime-file-command-host'
import {
  isMobileBinaryPath,
  isMobileMarkdownPath,
  isSafeMobileRelativePath
} from './runtime-file-command-host'
import { basenameFromRelativePath } from './runtime-file-paths'
import type { RuntimeFileListResult, RuntimeFileOpenResult } from '../../shared/runtime-types'
import { listQuickOpenFiles } from '../ipc/filesystem-list-files'
import {
  MOBILE_FILE_LIST_LIMIT,
  MOBILE_FILE_PATH_SEARCH_CACHE_LIMIT,
  isMobilePreviewableImagePath
} from './runtime-file-commands-mobile-file-list-limit'
import { rankRuntimeMobileFilePaths } from './runtime-mobile-file-path-search'
import { isQuickOpenQueryTooLarge } from '../../shared/quick-open-path-search'
import { searchQuickOpenFilePaths as searchHostQuickOpenFilePaths } from '../ipc/filesystem-search-file-paths'
import { stat } from 'node:fs/promises'
import { joinWorktreeRelativePath } from './runtime-relative-paths'
import { authorizeExternalPath, resolveAuthorizedPath } from '../ipc/filesystem-auth'
import { isENOENT } from '../ipc/filesystem-path-containment'
import { runtimeFileRouteForTarget, type RuntimeFileRoute } from './runtime-file-command-target'
import { isRuntimePathAbsolute, relativePathInsideRoot } from '../../shared/cross-platform-path'
import { validateExternalOpenPath } from '../../shared/external-file-open-path'
import { assertExternalOpenAllowed } from './runtime-file-external-open'

/** Previewable images open like text (mobile renders via files.readPreview); other binaries stay unavailable on mobile. */
function mobileOpenFileKind(path: string): RuntimeFileOpenResult['kind'] {
  if (isMobilePreviewableImagePath(path)) {
    return 'image'
  }
  if (isMobileBinaryPath(path)) {
    return 'binary'
  }
  return isMobileMarkdownPath(path) ? 'markdown' : 'text'
}

export class RuntimeFileCommandsWithConstructor extends RuntimeFileCommandsWithActiveRuntimeTextSearches {
  constructor(private readonly host: RuntimeFileCommandHost) {
    super()
  }

  async listMobileFiles(
    worktreeSelector: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<RuntimeFileListResult> {
    const store = this.host.requireStore()
    const target = await this.host.resolveRuntimeFileTarget(worktreeSelector)
    const { worktree } = target
    const route = runtimeFileRouteForTarget(target)
    const files =
      route.kind === 'ssh'
        ? await this.listRemoteMobileFiles(worktree.path, route.provider, undefined, options.signal)
        : await listQuickOpenFiles(worktree.path, store, undefined, options.signal)
    const entries = files
      .filter((relativePath) => isSafeMobileRelativePath(relativePath))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, MOBILE_FILE_LIST_LIMIT)
      .map((relativePath) => ({
        relativePath,
        basename: basenameFromRelativePath(relativePath),
        kind: isMobileBinaryPath(relativePath) ? ('binary' as const) : ('text' as const)
      }))

    return {
      worktree: worktree.id,
      rootPath: worktree.path,
      files: entries,
      totalCount: files.length,
      truncated: files.length > MOBILE_FILE_LIST_LIMIT
    }
  }

  async searchMobileFilePaths(
    worktreeSelector: string,
    query: string,
    limit: number
  ): Promise<RuntimeFileListResult> {
    const store = this.host.requireStore()
    const target = await this.host.resolveRuntimeFileTarget(worktreeSelector)
    const { worktree } = target
    const route = runtimeFileRouteForTarget(target)
    // Why: identical paths exist on local and on several SSH hosts; the cache key must name the
    // resolved host, which `connectionId` could not tell apart from "unresolved".
    const cacheKey = `${target.executionHostId}:${worktree.id}:${worktree.path}`
    const inventory = await this.mobileFilePathSearchCache.get(cacheKey, async () => {
      const listed =
        route.kind === 'ssh'
          ? await this.listRemoteMobileFiles(
              worktree.path,
              route.provider,
              MOBILE_FILE_PATH_SEARCH_CACHE_LIMIT + 1
            )
          : await listQuickOpenFiles(
              worktree.path,
              store,
              undefined,
              undefined,
              MOBILE_FILE_PATH_SEARCH_CACHE_LIMIT + 1
            )
      const safePaths = listed
        .filter((relativePath) => isSafeMobileRelativePath(relativePath))
        .sort((a, b) => a.localeCompare(b))
      return {
        paths: safePaths.slice(0, MOBILE_FILE_PATH_SEARCH_CACHE_LIMIT),
        totalCount: safePaths.length,
        truncated: safePaths.length > MOBILE_FILE_PATH_SEARCH_CACHE_LIMIT
      }
    })
    const matches = rankRuntimeMobileFilePaths(inventory.paths, query, limit)
    return {
      worktree: worktree.id,
      rootPath: worktree.path,
      files: matches.paths.map((relativePath) => ({
        relativePath,
        basename: basenameFromRelativePath(relativePath),
        kind: isMobileBinaryPath(relativePath) ? ('binary' as const) : ('text' as const)
      })),
      totalCount: matches.totalCount,
      truncated: inventory.truncated || matches.totalCount > limit
    }
  }

  async searchQuickOpenFilePaths(
    worktreeSelector: string,
    query: string,
    limit: number,
    excludePaths?: string[],
    signal?: AbortSignal
  ): Promise<RuntimeFileListResult> {
    const target = await this.host.resolveRuntimeFileTarget(worktreeSelector)
    const { worktree } = target
    const route = runtimeFileRouteForTarget(target)
    const result =
      !query.trim() || isQuickOpenQueryTooLarge(query)
        ? { paths: [], totalCount: 0, truncated: false }
        : route.kind === 'ssh'
          ? await this.searchRemoteQuickOpenFilePaths(
              worktree.path,
              route.provider,
              query,
              limit,
              excludePaths,
              signal
            )
          : await searchHostQuickOpenFilePaths(worktree.path, this.host.requireStore(), {
              query,
              limit,
              excludePaths,
              signal
            })
    return {
      worktree: worktree.id,
      rootPath: worktree.path,
      files: result.paths.map((relativePath) => ({
        relativePath,
        basename: basenameFromRelativePath(relativePath),
        kind: isMobileBinaryPath(relativePath) ? ('binary' as const) : ('text' as const)
      })),
      totalCount: result.totalCount,
      truncated: result.truncated
    }
  }

  async openMobileFile(
    worktreeSelector: string,
    relativePath: string,
    options: { allowOutsideWorkspace?: boolean } = {}
  ): Promise<RuntimeFileOpenResult> {
    const target = await this.host.resolveRuntimeFileTarget(worktreeSelector)
    const { worktree } = target
    const route = runtimeFileRouteForTarget(target)
    // An absolute path inside the root names the same file as its relative spelling, so only a
    // genuinely outside one needs the external grant. Dots fold first, or `<root>/../etc/x` would
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
        route,
        worktreePath: worktree.path
      })
      return await this.openExternalFile(worktree.id, absolutePath, route)
    }
    // Why the null: only an absolute path can miss the root, and that case returned above.
    if (insideRoot === null || !isSafeMobileRelativePath(insideRoot)) {
      throw new Error('invalid_relative_path')
    }
    const kind = mobileOpenFileKind(insideRoot)
    if (kind === 'binary') {
      return { worktree: worktree.id, relativePath: insideRoot, kind, opened: false }
    }
    const filePath = joinWorktreeRelativePath(worktree.path, insideRoot)
    // Why: CLI/agents treat opened:true as success; stat first so missing paths fail the RPC instead of opening a ghost tab.
    await this.assertMobileOpenTargetExists(filePath, route)
    // Why: the internal runtimeId isn't a valid env selector; pass undefined so openFile falls back to activeRuntimeEnvironmentId.
    this.host.openFile(worktree.id, filePath, insideRoot, undefined)
    return { worktree: worktree.id, relativePath: insideRoot, kind, opened: true }
  }

  /**
   * Opens a path that belongs to no workspace, granting the renderer's later read and
   * save the same way the desktop tab-bar's absolute-path entry does.
   */
  protected async openExternalFile(
    worktreeId: string,
    absolutePath: string,
    route: RuntimeFileRoute
  ): Promise<RuntimeFileOpenResult> {
    const kind = mobileOpenFileKind(absolutePath)
    if (kind === 'binary') {
      return {
        worktree: worktreeId,
        relativePath: absolutePath,
        kind,
        opened: false,
        outsideWorkspace: true
      }
    }
    // Why before the stat: resolveAuthorizedPath refuses anything outside the allowed roots, and
    // this one grant is what the editor's read and its save both ride on.
    authorizeExternalPath(absolutePath)
    const stats = await this.assertMobileOpenTargetExists(absolutePath, route)
    if (stats.isDirectory()) {
      throw new Error(`Cannot open a directory: ${absolutePath}`)
    }
    // Why the path twice: outside the root there is no relative spelling, which is also what the
    // tab-bar entry stores, so the tab dedupes and labels on the absolute path.
    this.host.openFile(worktreeId, absolutePath, absolutePath, undefined)
    return {
      worktree: worktreeId,
      relativePath: absolutePath,
      kind,
      opened: true,
      outsideWorkspace: true
    }
  }

  protected async assertMobileOpenTargetExists(
    filePath: string,
    route: RuntimeFileRoute
  ): Promise<{ isDirectory: () => boolean }> {
    try {
      return await (route.kind === 'ssh'
        ? this.statRemoteTerminalPath(filePath, route.connectionId)
        : stat(await resolveAuthorizedPath(filePath, this.host.requireStore())))
    } catch (error) {
      if (
        isENOENT(error) ||
        (route.kind === 'ssh' && RuntimeFileCommands.isRemoteNotFoundErrorMessage(error))
      ) {
        throw new Error(`ENOENT: no such file or directory, open '${filePath}'`)
      }
      throw error
    }
  }

  async openMobileDiff(
    worktreeSelector: string,
    relativePath: string,
    staged: boolean
  ): Promise<RuntimeFileOpenResult> {
    const { worktree } = await this.host.resolveRuntimeFileTarget(worktreeSelector)
    if (!isSafeMobileRelativePath(relativePath)) {
      throw new Error('invalid_relative_path')
    }
    const kind = isMobileBinaryPath(relativePath)
      ? 'binary'
      : isMobileMarkdownPath(relativePath)
        ? 'markdown'
        : 'text'
    const filePath = joinWorktreeRelativePath(worktree.path, relativePath)
    // Why: see openMobileFile; avoid stamping internal runtimeId as runtimeEnvironmentId.
    this.host.openDiff(worktree.id, filePath, relativePath, staged, undefined)
    return { worktree: worktree.id, relativePath, kind, opened: true }
  }
}
