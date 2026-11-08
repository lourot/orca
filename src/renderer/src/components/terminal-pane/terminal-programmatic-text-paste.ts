import type { PasteTerminalTextDetail } from '@/constants/terminal'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import type { PtyTransport } from './pty-transport-types'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import { recordTerminalUserInputForLeaf } from './terminal-input-activity'
import { pasteTextIntoTerminalPane } from './terminal-pane-paste-dispatch'
import { resolveTerminalPasteRuntime } from './terminal-paste-runtime'
import { isTerminalPanePasteTargetCurrent } from './terminal-paste-target-state'

type HandleTerminalProgrammaticTextPasteArgs = {
  detail: PasteTerminalTextDetail | undefined
  tabId: string
  getManager: () => PaneManager | null
  getPaneTransports: () => Map<number, PtyTransport>
  /** False for a background tab, so a late paste cannot pull focus away from where the user is typing. */
  focusAfterPaste?: boolean
  /** Rewrites the text for the resolved pane, from whether it is in bracketed-paste mode. */
  textForPane?: (bracketedPasteMode: boolean) => string
}

/** Pastes into this tab's target pane; false when the event is not for this tab or no pane can take it. */
export function handleTerminalProgrammaticTextPaste({
  detail,
  tabId,
  getManager,
  getPaneTransports,
  focusAfterPaste = true,
  textForPane
}: HandleTerminalProgrammaticTextPasteArgs): boolean {
  if (!detail?.tabId || detail.tabId !== tabId || !detail.text) {
    return false
  }
  const manager = getManager()
  if (!manager) {
    return false
  }
  const panes = manager.getPanes()
  const pane =
    typeof detail.paneId === 'number'
      ? (panes.find((candidate) => candidate.id === detail.paneId) ?? null)
      : (manager.getActivePane() ?? panes[0])
  if (!pane) {
    return false
  }
  const paneTransports = getPaneTransports()
  const transport = paneTransports.get(pane.id)
  const ptyId = transport?.getPtyId() ?? null
  const isTargetCurrent = (): boolean =>
    isTerminalPanePasteTargetCurrent({
      manager: getManager(),
      paneTransports: getPaneTransports(),
      paneId: pane.id,
      leafId: pane.leafId,
      transport,
      ptyId
    })
  void pasteTextIntoTerminalPane({
    pane,
    text: textForPane ? textForPane(pane.terminal.modes?.bracketedPasteMode === true) : detail.text,
    source: 'programmatic',
    ptyId,
    runtime: resolveTerminalPasteRuntime({
      platform: getShortcutPlatform(),
      ptyId,
      transport
    }),
    transport,
    inputKind: 'driving',
    isTargetCurrent,
    canContinue: isTargetCurrent
  }).then((result) => {
    if (result.status !== 'pasted') {
      return
    }
    recordTerminalUserInputForLeaf(tabId, pane.leafId)
    if (focusAfterPaste) {
      pane.terminal.focus()
    }
  })
  return true
}
