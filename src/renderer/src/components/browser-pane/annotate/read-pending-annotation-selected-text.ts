import type { BrowserGrabPayload } from '../../../../../shared/browser-grab-types'

// A busy page must not hold up adding the note.
const READ_TIMEOUT_MS = 500

/**
 * Returns the payload quoting the text selected inside its element since the pick, so a
 * selection made after clicking counts. Keeps the click-time selection when there is none.
 */
export async function withSelectionAtAdd(
  browserPageId: string,
  payload: BrowserGrabPayload
): Promise<BrowserGrabPayload> {
  const read = window.api?.browser?.readGrabSelectedText
  // The web client and older mains have no such call.
  if (typeof read !== 'function') {
    return payload
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const selectedText = await Promise.race([
    read({ browserPageId }).catch(() => null),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS)
    })
  ])
  clearTimeout(timer)
  return selectedText ? { ...payload, target: { ...payload.target, selectedText } } : payload
}
