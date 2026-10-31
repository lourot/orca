import type { AppState } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { editorModelRegistry, type EditorModelRegistryBridge } from '@/lib/editor-model-registry'
import { editorTabModelUri } from './editor-save-disk-precondition'
import { formatPathLineReference } from './line-copy-path'
import { getRemoteUrlLineRange } from './selection-copy'

/**
 * `file`'s relative path with the lines selected in the editor showing it (a focused one first),
 * or the bare path when no code editor shows it, e.g. a rich Markdown view.
 */
export function formatActiveEditorLineReference(
  state: AppState,
  file: OpenFile,
  bridge: EditorModelRegistryBridge = editorModelRegistry
): string {
  const registry = bridge.get()
  const uri = editorTabModelUri(state, file)
  const editors = (registry?.editor.getEditors() ?? []).filter(
    (editor) => editor.getModel()?.uri.toString() === registry?.Uri.parse(uri).toString()
  )
  const selection = (editors.find((editor) => editor.hasTextFocus()) ?? editors[0])?.getSelection()
  return selection
    ? formatPathLineReference(
        file.relativePath,
        getRemoteUrlLineRange(selection.startLineNumber, selection)
      )
    : file.relativePath
}
