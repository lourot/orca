import { useEffect } from 'react'
import { useAppStore } from '@/store'

// Why a poll: the 24h dimming and the day columns move with the clock, not only with new turns.
const PROJECT_ACTIVITY_POLL_MS = 60_000

/** Keeps the per-project activity behind the sidebar heatmap and title dimming fresh. */
export function useProjectActivityPolling(): void {
  const fetchProjectActivity = useAppStore((s) => s.fetchProjectActivity)
  useEffect(() => {
    void fetchProjectActivity()
    const timer = setInterval(() => void fetchProjectActivity(), PROJECT_ACTIVITY_POLL_MS)
    return () => clearInterval(timer)
  }, [fetchProjectActivity])
}
