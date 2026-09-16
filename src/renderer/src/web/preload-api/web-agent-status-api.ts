import type { PreloadApi } from '../../../../preload/api-types'
import { translate } from '@/i18n/i18n'
import { noopUnsubscribe } from './web-storage'

export function createWebAgentStatusApi(): Partial<PreloadApi> {
  return {
    agentStatus: {
      onSet: () => noopUnsubscribe,
      onClear: () => noopUnsubscribe,
      getSnapshot: () => Promise.resolve([]),
      inferInterrupt: () => Promise.resolve(false),
      inferQuestionAnswered: () => Promise.resolve(false),
      onMigrationUnsupported: () => noopUnsubscribe,
      onMigrationUnsupportedClear: () => noopUnsubscribe,
      onLegacyWorkerTerminalRecovery: () => noopUnsubscribe,
      getMigrationUnsupportedSnapshot: () => Promise.resolve([]),
      drop: () => {},
      dropPersisted: () => {},
      dropPersistedBatch: () => {},
      reconcileEndedProcess: () => {},
      dropByTabPrefix: () => {},
      retirePaneAuthority: () => {},
      restorePaneAuthority: () => {},
      transferPaneAuthority: () => {},
      generateRollingTitle: () =>
        Promise.resolve({
          success: false,
          error: translate('auto.web.web.preload.api.fb290366b2', 'Unavailable on web.')
        })
    }
  }
}
