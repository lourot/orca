import { ipcRenderer } from 'electron'
import { createUsageProviderApi } from '../usage-provider-api'
import type { PreloadApi } from '../api-types'

export const openCodeUsageApi = {
  ...createUsageProviderApi(ipcRenderer, 'openCodeUsage'),
  setOpenCodeMonthlyCap: (args: { capUsd: number }) =>
    ipcRenderer.invoke('openCodeUsage:setOpenCodeMonthlyCap', args)
} satisfies PreloadApi['openCodeUsage']
