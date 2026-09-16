import { useEffect } from 'react'
import { startRollingAgentTitleSync } from '@/lib/rolling-agent-title-sync'
import { useAppStore } from '@/store'

export function RollingAgentTitleSyncGate(): null {
  useEffect(
    () =>
      startRollingAgentTitleSync({
        getState: useAppStore.getState,
        subscribe: useAppStore.subscribe,
        generateTitle: (args) => window.api.agentStatus.generateRollingTitle(args)
      }),
    []
  )
  return null
}
