import { useEffect } from 'react'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { useAppStore } from '../../store'

// Why: must stay well under the main store's 5-minute staleness window — a tick that lands
// just inside it no-ops, which would halve the effective refresh rate.
export const OPEN_CODE_USAGE_POLL_MS = 60_000

/** Loads the monthly OpenCode cost estimate when analytics are enabled, and keeps it fresh. */
export function useStatusBarOpenCodeUsage(): {
  scanState: ReturnType<typeof useAppStore.getState>['openCodeUsageScanState']
  usage: NonNullable<
    ReturnType<typeof useAppStore.getState>['openCodeUsageSummary']
  >['openCodeMonthlyCost']
  fetch: ReturnType<typeof useAppStore.getState>['fetchOpenCodeUsage']
} {
  const scanState = useAppStore((state) => state.openCodeUsageScanState)
  const summary = useAppStore((state) => state.openCodeUsageSummary)
  const fetch = useAppStore((state) => state.fetchOpenCodeUsage)

  useEffect(() => {
    // Why: unforced, so the main store's own staleness window decides whether a rescan happens; a tick inside it costs one IPC call.
    return installWindowVisibilityInterval({
      run: () => void fetch(),
      intervalMs: OPEN_CODE_USAGE_POLL_MS
    })
  }, [fetch])

  return { scanState, usage: summary?.openCodeMonthlyCost, fetch }
}
