import type { KeybindingActionId } from '../../../shared/keybindings'
import { useAppStore } from '../store'
import {
  ORCA_EDITOR_REQUEST_CMD_SAVE_EVENT,
  type EditorRequestCmdSaveDetail
} from './editor/editor-autosave'
import { getEditorCmdSaveFileId } from './editor/editor-cmd-save-target'
import { requestEditorTabDiskReload } from './editor/editor-tab-disk-reload'
import { isEventTargetInsideFloatingWorkspacePanel } from '@/lib/floating-workspace-terminal-actions'

type EditorShortcutContext = {
  event: KeyboardEvent
  floatingWorkspaceFocused: boolean
  matchShortcut: (actionId: KeybindingActionId) => boolean
  notifyTerminalCapture: (actionId: KeybindingActionId) => void
}

// Return false for unclaimed chords so remaining workspace shortcuts can handle them.
export function handleTerminalWorkspaceEditorShortcut({
  event,
  floatingWorkspaceFocused,
  matchShortcut,
  notifyTerminalCapture
}: EditorShortcutContext): boolean {
  // Save fallback for focus outside the editor; editor-local handlers own focused saves.
  if (!event.repeat && matchShortcut('editor.save')) {
    const target = event.target as HTMLElement | null
    const inEditor =
      target?.closest('.monaco-editor, [contenteditable]') !== null ||
      target?.closest('textarea:not(.xterm-helper-textarea), input') !== null
    if (!inEditor) {
      const state = useAppStore.getState()
      const floatingPanelOwnsEvent =
        isEventTargetInsideFloatingWorkspacePanel(event.target) || floatingWorkspaceFocused
      const requestedFileId = getEditorCmdSaveFileId(state, floatingPanelOwnsEvent)
      if (requestedFileId) {
        event.preventDefault()
        notifyTerminalCapture('editor.save')
        window.dispatchEvent(
          new CustomEvent<EditorRequestCmdSaveDetail>(ORCA_EDITOR_REQUEST_CMD_SAVE_EVENT, {
            detail: { fileId: requestedFileId }
          })
        )
        return true
      }
    }
  }
  // Why: long/structured files need a discoverable unwrap path without Settings (#9974).
  if (!event.repeat && matchShortcut('editor.toggleWordWrap')) {
    const state = useAppStore.getState()
    if (state.activeTabType === 'editor' && state.activeFileId) {
      event.preventDefault()
      notifyTerminalCapture('editor.toggleWordWrap')
      // Why: diff surfaces use diffWordWrap; plain editors use editorWordWrap (#10086).
      const activeFile = state.openFiles.find((file) => file.id === state.activeFileId)
      if (activeFile?.mode === 'diff') {
        const wrapOn = state.settings?.diffWordWrap === true
        void state.updateSettings({ diffWordWrap: !wrapOn })
      } else {
        const wrapOn = state.settings?.editorWordWrap !== false
        void state.updateSettings({ editorWordWrap: !wrapOn })
      }
      return true
    }
  }
  // Why: the conflict banner is the only other way to reach a disk reload, and it
  // needs unsaved edits plus a watcher hit — this is the lever for a tab the user
  // already suspects is stale (#11085).
  if (!event.repeat && matchShortcut('editor.reloadFromDisk')) {
    const state = useAppStore.getState()
    if (state.activeTabType === 'editor' && state.activeFileId) {
      event.preventDefault()
      notifyTerminalCapture('editor.reloadFromDisk')
      requestEditorTabDiskReload(state.activeFileId)
      return true
    }
  }
  return false
}
