import '../unused-default-rpc-methods.test-fixture'
import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { WORKTREE_METHODS } from './worktree'

function makeRequest(method: string, params?: unknown) {
  return { id: 'req-1', authToken: 'tok', method, params }
}

const passthroughDedupe = <T>(_repo: string, _id: string | undefined, run: () => Promise<T>) =>
  run()

describe('worktree.set review notes', () => {
  it('leaves general notes out of a worktree.set that only carries diffComments', async () => {
    // The stock mobile app writes its whole diffComments list and knows nothing of general notes.
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: worktree.set only calls these runtime members.
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      dedupeWorktreeCreate: passthroughDedupe,
      updateManagedWorktreeMeta: vi.fn().mockResolvedValue({ id: 'wt-1' })
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: WORKTREE_METHODS })

    await dispatcher.dispatch(
      makeRequest('worktree.set', { worktree: 'id:wt-1', diffComments: [] })
    )
    const general = { id: 'g-1', worktreeId: 'wt-1', body: 'Bump the SDK', createdAt: 1 }
    await dispatcher.dispatch(
      makeRequest('worktree.set', { worktree: 'id:wt-1', generalNotes: [general] })
    )

    const calls = vi.mocked(runtime.updateManagedWorktreeMeta).mock.calls
    expect(calls.map(([, updates]) => [updates.diffComments, updates.generalNotes])).toEqual([
      [[], undefined],
      [undefined, [general]]
    ])
  })
})
