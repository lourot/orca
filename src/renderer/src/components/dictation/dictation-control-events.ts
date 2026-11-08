export const DICTATION_CONTROL_EVENT = 'dictation:control'

/** Dictation started with no text field focused; the pane that owns typing focuses its input. */
export const DICTATION_FOCUS_INPUT_EVENT = 'dictation:focusInput'

export type DictationControlAction = 'toggle' | 'start' | 'stop'

export function dispatchDictationControl(action: DictationControlAction): void {
  document.dispatchEvent(
    new CustomEvent<DictationControlAction>(DICTATION_CONTROL_EVENT, { detail: action })
  )
}

export type DictationTerminalInsert = {
  text: string
  agentText?: string
  tabId?: string
  paneId?: number
}

/** Reads a `dictation:insertText` event's detail: a bare string, or text with its target pane. */
export function readDictationTerminalInsert(event: Event): DictationTerminalInsert | null {
  if (!(event instanceof CustomEvent)) {
    return null
  }
  const detail: unknown = event.detail
  if (typeof detail === 'string') {
    return detail ? { text: detail } : null
  }
  if (typeof detail !== 'object' || detail === null || !('text' in detail)) {
    return null
  }
  const { text } = detail
  if (typeof text !== 'string' || !text) {
    return null
  }
  const agentText = Reflect.get(detail, 'agentText')
  const tabId = Reflect.get(detail, 'tabId')
  const paneId = Reflect.get(detail, 'paneId')
  return {
    text,
    agentText: typeof agentText === 'string' ? agentText : undefined,
    tabId: typeof tabId === 'string' ? tabId : undefined,
    paneId: typeof paneId === 'number' ? paneId : undefined
  }
}
