import { useCallback, useRef, useState } from 'react'
import { observeStatusBarContainer } from './status-bar-container-observer'

/** Tracks status-bar width and disconnects the resize observer on remount. */
export function useStatusBarContainer(): {
  containerRefCallback: (node: HTMLDivElement | null) => void
  containerWidth: number
} {
  const [containerWidth, setContainerWidth] = useState(900)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const containerRefCallback = useCallback((node: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect()
    resizeObserverRef.current = null
    if (node) {
      resizeObserverRef.current = observeStatusBarContainer(node, setContainerWidth)
      setContainerWidth(node.getBoundingClientRect().width)
    }
  }, [])

  return { containerRefCallback, containerWidth }
}
