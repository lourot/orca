import { useEffect } from 'react'
import type { OpenFile } from '@/store/slices/editor'
import {
  ORCA_EDITOR_REQUEST_FILE_RELOAD_EVENT,
  type EditorRequestFileReloadDetail
} from './editor-autosave'
import { isReloadableSingleFileDiffTab } from './editor-panel-diff-reload'
import { getExternalEventGeneration } from './editor-external-event-generation'
import type { UseEditorPanelExternalContentEventsParams } from './useEditorPanelExternalContentEvents'

type OwnedFileReloadDeps = Pick<
  UseEditorPanelExternalContentEventsParams,
  'editorViewModeRef' | 'loadDiffContent' | 'loadFileContent'
>

// Explicit reload requests skip the watcher coalescer; keep this per-mode refetch in step with it.
function forceReloadOwnedFile(
  file: OpenFile,
  eventGeneration: number,
  { editorViewModeRef, loadDiffContent, loadFileContent }: OwnedFileReloadDeps,
  onDiffInvalidate: (fileId: string) => void
): void {
  if (file.mode === 'edit' || file.mode === 'markdown-preview') {
    // Why force: the reload must replace any in-flight pre-change read so the
    // tab shows the new on-disk content, not a stale dedupe result.
    void loadFileContent(file.filePath, file.id, file.worktreeId, file.relativePath, {
      force: true,
      externalEventGeneration: eventGeneration
    })
    if (editorViewModeRef.current[file.id] === 'changes') {
      void loadDiffContent(file, {
        force: true,
        externalEventGeneration: eventGeneration
      })
    } else {
      onDiffInvalidate(file.id)
    }
    return
  }
  if (isReloadableSingleFileDiffTab(file)) {
    void loadDiffContent(file, {
      force: true,
      externalEventGeneration: eventGeneration
    })
  }
}

/** Serves explicit "Reload from Disk" requests for the files this panel holds. */
export function useEditorPanelReloadRequestEvents({
  activeContentFileIdRef,
  editorViewModeRef,
  invalidateContent,
  invalidateDiffContent,
  isVisibleRef,
  loadDiffContent,
  loadFileContent,
  openFilesRef
}: Pick<
  UseEditorPanelExternalContentEventsParams,
  | 'activeContentFileIdRef'
  | 'editorViewModeRef'
  | 'invalidateContent'
  | 'invalidateDiffContent'
  | 'isVisibleRef'
  | 'loadDiffContent'
  | 'loadFileContent'
  | 'openFilesRef'
>): void {
  useEffect(() => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<EditorRequestFileReloadDetail>).detail
      if (!detail) {
        return
      }
      const file = openFilesRef.current.find((openFile) => openFile.id === detail.fileId)
      if (!file) {
        return
      }
      // Why no dirty skip: per the requestEditorFileReload contract the draft is
      // already discarded — this snapshot can still say dirty because that store
      // write hasn't rendered yet, and skipping would drop an explicit reload.
      if (!isVisibleRef.current || file.id !== activeContentFileIdRef.current) {
        invalidateContent([file.id])
        return
      }
      forceReloadOwnedFile(
        file,
        getExternalEventGeneration(event),
        { editorViewModeRef, loadDiffContent, loadFileContent },
        (fileId) => invalidateDiffContent([fileId])
      )
    }
    window.addEventListener(ORCA_EDITOR_REQUEST_FILE_RELOAD_EVENT, handler as EventListener)
    return () =>
      window.removeEventListener(ORCA_EDITOR_REQUEST_FILE_RELOAD_EVENT, handler as EventListener)
  }, [
    activeContentFileIdRef,
    editorViewModeRef,
    invalidateContent,
    invalidateDiffContent,
    isVisibleRef,
    loadDiffContent,
    loadFileContent,
    openFilesRef
  ])
}
