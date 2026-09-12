import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { isExternalReloadableEditorTab, requestEditorFileReload } from './editor-autosave'
import { reloadTabContentFromDisk } from './ExternalFileChangeBanner'

/** User-requested "Reload from Disk" (editor tab context menu, `editor.reloadFromDisk`).
 *  Always routes through reloadTabContentFromDisk — isDirty lags editorDrafts (debounced),
 *  so gating on it could leave a not-yet-dirty draft shadowing the reloaded content. For
 *  clean tabs its mutations are no-ops and its Undo toast fires only when a draft was
 *  actually discarded; the refetch itself is delegated to the owning EditorPanel via the
 *  reload-request event. */
export function requestEditorTabDiskReload(fileId: string): void {
  const state = useAppStore.getState()
  const file = state.openFiles.find((openFile) => openFile.id === fileId)
  if (!file || !isExternalReloadableEditorTab(file)) {
    return
  }
  const hadDraft = state.editorDrafts[fileId] !== undefined
  reloadTabContentFromDisk(file, (target) => requestEditorFileReload(target.id))
  if (!hadDraft) {
    // Why: unlike the conflict banner, this action can be invoked when nothing
    // changed, and then it is completely silent — while still rotating the Monaco
    // model and dropping its undo stack. Confirm it ran. No Undo action: no draft
    // was discarded, and the undo stack is unrecoverable either way.
    toast(translate('components.editor.editorTabDiskReload.reloaded', 'Reloaded from disk'), {
      description: file.relativePath
    })
  }
}
