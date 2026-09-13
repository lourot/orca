import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { WORKTREE_METHODS } from './worktree'

function resolveActiveRequest(): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method: 'worktree.resolveActive', params: {} }
}

describe('worktree.resolveActive', () => {
  it('answers with the focused workspace id', async () => {
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      resolveActiveWorktreeContext: vi.fn().mockResolvedValue({
        worktreeId: 'repo::/tmp/repo',
        path: '/tmp/repo',
        branch: 'feature',
        displayName: 'feature'
      })
    } as unknown as OrcaRuntimeService

    const response = await new RpcDispatcher({ runtime, methods: WORKTREE_METHODS }).dispatch(
      resolveActiveRequest()
    )

    expect(response).toMatchObject({ ok: true, result: { worktree: 'repo::/tmp/repo' } })
  })

  // Why null and not an error: the caller falls back to its own message, which names what to do.
  it('answers null when nothing is focused', async () => {
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      resolveActiveWorktreeContext: vi.fn().mockResolvedValue(null)
    } as unknown as OrcaRuntimeService

    const response = await new RpcDispatcher({ runtime, methods: WORKTREE_METHODS }).dispatch(
      resolveActiveRequest()
    )

    expect(response).toMatchObject({ ok: true, result: { worktree: null } })
  })
})
