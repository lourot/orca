import type { BrowserGrabRect } from '../../../../../shared/browser-grab-types'

type ClientRect = { left: number; top: number; width: number; height: number }

/**
 * Places the grab toast beside the element, in container coordinates: below it when there is
 * room, above it otherwise; centred in the container when there is no element.
 */
export function grabToastPosition(
  elementRect: BrowserGrabRect | null,
  containerRect: ClientRect | undefined,
  webviewRect: ClientRect | undefined
): { x: number; y: number; below: boolean } {
  if (!elementRect) {
    return containerRect
      ? { x: containerRect.width / 2, y: containerRect.height / 2, below: true }
      : { x: 0, y: 0, below: true }
  }
  const offsetX = (webviewRect?.left ?? 0) - (containerRect?.left ?? 0)
  const offsetY = (webviewRect?.top ?? 0) - (containerRect?.top ?? 0)
  const elementBottom = offsetY + elementRect.y + elementRect.height
  const below = elementBottom + 52 < (containerRect?.height ?? 0)
  return {
    x: offsetX + elementRect.x + elementRect.width / 2,
    y: below ? elementBottom : offsetY + elementRect.y,
    below
  }
}
