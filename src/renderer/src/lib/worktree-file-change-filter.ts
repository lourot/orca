import {
  normalizeRuntimePathForComparison,
  relativePathInsideRoot
} from '../../../shared/cross-platform-path'
import type { FsChangedPayload } from '../../../shared/filesystem-entry-types'

/** True when a watcher batch for `rootPath` touches a file under it, or overflowed. */
export function isFileChangeUnderRoot(payload: FsChangedPayload, rootPath: string): boolean {
  if (
    normalizeRuntimePathForComparison(payload.worktreePath) !==
    normalizeRuntimePathForComparison(rootPath)
  ) {
    return false
  }

  return payload.events.some((event) => {
    if (event.kind === 'overflow') {
      return true
    }
    if (event.isDirectory === true) {
      return false
    }
    return relativePathInsideRoot(rootPath, event.absolutePath) !== null
  })
}
