import { isRuntimePathAbsolute, resolveRuntimePath } from './cross-platform-path'

/**
 * Validates and normalizes an absolute path handed in as an open target that may
 * sit outside every workspace root.
 *
 * The workspace-relative flow can rely on the root to bound a path; an external
 * target has no root, so every refusal it would have inherited is made here.
 * Throws with text meant to reach the CLI caller verbatim.
 */
export function validateExternalOpenPath(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Enter a file path.')
  }
  if (Array.from(trimmed).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw new Error('File paths cannot contain control characters.')
  }
  if (/[\\/]$/.test(trimmed)) {
    throw new Error('Enter a file path, not a directory path.')
  }
  if (!isRuntimePathAbsolute(trimmed)) {
    throw new Error('Enter an absolute file path.')
  }
  // Why the empty base: the target is already absolute, so this only folds its `.` and `..` segments.
  return resolveRuntimePath('', trimmed)
}
