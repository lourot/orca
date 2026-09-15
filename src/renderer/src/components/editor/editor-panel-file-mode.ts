import type { OpenFile } from '@/store/slices/editor'

export function isAbsolutePathLike(value: string): boolean {
  return value.startsWith('/') || value.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(value)
}

/**
 * Whether the plain Monaco editor offers review notes. Any text language
 * qualifies - notes decorate the model, not rendered markdown - but a notebook's
 * source mode is raw JSON whose line numbers mean nothing to the reader.
 * Binary content never reaches a Monaco surface, so it is not a case here.
 */
export function canAnnotateEditorSurface({
  annotationsEnabled,
  isNotebook
}: {
  annotationsEnabled: boolean
  isNotebook: boolean
}): boolean {
  return annotationsEnabled && !isNotebook
}

export function canUseChangesModeForFile(file: OpenFile): boolean {
  return (
    file.mode === 'edit' &&
    !file.isUntitled &&
    file.relativePath !== file.filePath &&
    !isAbsolutePathLike(file.relativePath)
  )
}
