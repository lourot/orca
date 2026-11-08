import { ipcMain } from 'electron'
import { z } from 'zod'
import type { DictationCleanupResult } from '../../shared/speech-types'
import type { Store } from '../persistence'
import type { CommitMessageAgentEnvironmentResolvers } from '../text-generation/commit-message-agent-environment'
import {
  cancelDictationCleanupRequest,
  generateDictationCleanupRequest
} from '../text-generation/dictation-cleanup-requests'

const CancelDictationCleanup = z.object({ sessionId: z.string().trim().min(1).max(128) })
const DictationCleanup = CancelDictationCleanup.extend({
  transcript: z.string().trim().min(1).max(32_000)
})

/** Registers the IPC handlers that clean up a finished dictation with an agent CLI. */
export function registerDictationCleanupHandlers(
  store: Pick<Store, 'getSettings'>,
  commitMessageAgentEnv?: CommitMessageAgentEnvironmentResolvers
): void {
  ipcMain.handle(
    'speech:cleanupTranscript',
    async (event, args: unknown): Promise<DictationCleanupResult> => {
      const request = DictationCleanup.parse(args)
      const owner = `window:${event.sender.id}`
      const cancel = (): void => cancelDictationCleanupRequest(owner, request.sessionId)
      event.sender.once('destroyed', cancel)
      try {
        const result = await generateDictationCleanupRequest(
          {
            getSettings: () => store.getSettings(),
            getAgentEnvironment: () => commitMessageAgentEnv
          },
          owner,
          request
        )
        return result.success
          ? { ok: true, text: result.text }
          : { ok: false, error: result.error, ...(result.canceled ? { canceled: true } : {}) }
      } finally {
        event.sender.removeListener('destroyed', cancel)
      }
    }
  )
  ipcMain.handle('speech:cancelCleanup', (event, args: unknown) => {
    const { sessionId } = CancelDictationCleanup.parse(args)
    cancelDictationCleanupRequest(`window:${event.sender.id}`, sessionId)
  })
}
