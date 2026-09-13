import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { FILE_METHODS } from './files'

function openRequest(relativePath: string): RpcRequest {
  return {
    id: 'req-1',
    authToken: 'tok',
    method: 'files.open',
    params: { worktree: 'id:wt-1', relativePath }
  }
}

function runtimeWithOpen(): OrcaRuntimeService {
  return {
    getRuntimeId: () => 'test-runtime',
    openMobileFile: vi.fn().mockResolvedValue({
      worktree: 'wt-1',
      relativePath: 'docs/readme.md',
      kind: 'markdown',
      opened: true
    })
  } as unknown as OrcaRuntimeService
}

describe('files.open outside-workspace gate', () => {
  // Why both kinds: only a paired device sets clientKind, so this is what keeps files.open
  // safe on the mobile allowlist now that it can reach outside the workspace.
  it.each([['mobile'], ['runtime']] as const)('refuses it for a %s client', async (clientKind) => {
    const runtime = runtimeWithOpen()
    const dispatcher = new RpcDispatcher({ runtime, methods: FILE_METHODS })

    await dispatcher.dispatch(openRequest('/home/alice/.zshrc'), { clientKind })

    expect(runtime.openMobileFile).toHaveBeenCalledWith('id:wt-1', '/home/alice/.zshrc', {
      allowOutsideWorkspace: false
    })
  })

  it('allows it for a local caller, which sets no clientKind', async () => {
    const runtime = runtimeWithOpen()
    const dispatcher = new RpcDispatcher({ runtime, methods: FILE_METHODS })

    await dispatcher.dispatch(openRequest('/home/alice/.zshrc'))

    expect(runtime.openMobileFile).toHaveBeenCalledWith('id:wt-1', '/home/alice/.zshrc', {
      allowOutsideWorkspace: true
    })
  })
})
