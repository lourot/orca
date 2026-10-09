import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Repo } from '../../shared/repo-types'
import { routeBacklogOperation } from './backlog-host'
import { executeBacklogOperation } from './backlog-service'

vi.mock('./backlog-service', () => ({ executeBacklogOperation: vi.fn() }))
const operation = { kind: 'read', id: 'OPS-001' } as const
const repo: Repo = {
  id: 'project',
  path: '/project',
  displayName: 'Project',
  badgeColor: '',
  addedAt: 0,
  kind: 'folder'
}
beforeEach(() => vi.resetAllMocks())

describe('Backlog execution host boundary', () => {
  it('reads local folder projects through the same service', async () => {
    await routeBacklogOperation(repo, operation)
    expect(executeBacklogOperation).toHaveBeenCalledWith('/project', operation)
  })
  it.each([
    ['an SSH project', { connectionId: 'remote' }, 'not available for SSH'],
    [
      'a project owned by another runtime',
      { executionHostId: 'runtime:server', connectionId: 'remote' },
      'execution runtime'
    ]
  ] as const)('refuses %s without falling back to local files', async (_, owner, message) => {
    await expect(routeBacklogOperation({ ...repo, ...owner }, operation)).rejects.toThrow(message)
    expect(executeBacklogOperation).not.toHaveBeenCalled()
  })
})
