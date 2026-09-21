import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store'
import type { CodexLocalCreditEstimate } from '../../../../shared/codex-usage-types'

/** Loads the local Codex credit estimate when its analytics toggle is enabled. */
export function useStatusBarCodexCreditEstimate(): {
  estimate: CodexLocalCreditEstimate | null
  enabled: boolean
  refresh: () => Promise<void>
} {
  const scanState = useAppStore((state) => state.codexUsageScanState)
  const mountedRef = useRef(true)
  const [estimate, setEstimate] = useState<CodexLocalCreditEstimate | null>(null)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    const getScanState = window.api.codexUsage.getScanState
    const getEstimate = window.api.codexUsage.getCurrentMonthCreditEstimate
    if (typeof getScanState !== 'function' || typeof getEstimate !== 'function') {
      setEnabled(false)
      setEstimate(null)
      return
    }
    try {
      const nextScanState = await getScanState()
      if (!nextScanState?.enabled) {
        setEnabled(false)
        setEstimate(null)
        return
      }
      setEnabled(true)
      const nextEstimate = await getEstimate()
      if (mountedRef.current) {
        setEstimate(nextEstimate)
      }
    } catch (error) {
      console.error('Failed to fetch local Codex credit estimate:', error)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, scanState?.enabled, scanState?.lastScanCompletedAt])

  return { estimate, enabled, refresh }
}
