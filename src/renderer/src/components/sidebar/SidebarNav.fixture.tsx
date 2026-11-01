import { defineFixture } from '../../component-fixtures/component-fixture'
import { getDefaultSettings } from '../../../../shared/constants'
import SidebarNav from './SidebarNav'

/** Isolate the Messages row with real sidebar styles and a metadata-only RPC reply. */
function messagesFixture(active: boolean, recent: boolean) {
  return defineFixture({
    width: 260,
    store: {
      activeView: active ? 'messages' : 'terminal',
      setupGuideSidebarDismissed: true,
      settings: {
        ...getDefaultSettings('/fixture'),
        showTasksButton: false,
        showMobileButton: false,
        showAutomationsButton: false
      }
    },
    setup: () => {
      window.localStorage.removeItem('orca.messages.acknowledged')
      window.api.runtime.call = async () => ({
        id: 'fixture',
        ok: true,
        result: { latest: recent ? { id: 1, sentAt: Date.now() } : null },
        _meta: { runtimeId: 'fixture' }
      })
    },
    render: () => (
      <div className="bg-worktree-sidebar text-worktree-sidebar-foreground">
        <SidebarNav />
      </div>
    )
  })
}

export const recent = messagesFixture(false, true)
export const recentSelected = messagesFixture(true, true)
export const quiet = messagesFixture(false, false)
export const quietSelected = messagesFixture(true, false)
