import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AutomationOwnerRef } from '../../../../shared/automation-owner-ref'
import { AutomationOwnerConflictError } from '../../../../shared/automation-owner-conflict'
import { automationActionAvailability } from './automation-captured-owner'
import {
  duplicateOwnedAutomation,
  type AutomationDuplicateOperation
} from './automation-owner-action-runner'
import {
  createAutomationForDestination,
  listAutomationsForOwner
} from './automation-scoped-list-client'
import { makeAutomation } from './automations-page-fixtures'
import type * as ScopedListClient from './automation-scoped-list-client'

vi.mock('./automation-scoped-list-client', async (importOriginal) => ({
  ...(await importOriginal<typeof ScopedListClient>()),
  listAutomationsForOwner: vi.fn(),
  createAutomationForDestination: vi.fn()
}))

const localOwner: AutomationOwnerRef = {
  authority: { kind: 'desktop' },
  selector: { kind: 'self' }
}
const owners: AutomationOwnerRef[] = [
  localOwner,
  {
    authority: { kind: 'desktop' },
    selector: { kind: 'ssh', targetId: 'ssh-1', targetGeneration: 7 }
  },
  {
    authority: { kind: 'runtime', environmentId: 'gpu', pairingRevision: 4 },
    selector: { kind: 'self' }
  }
]
const source = makeAutomation({ name: 'Latest name', prompt: 'Latest prompt' })
const list = vi.mocked(listAutomationsForOwner)
const create = vi.mocked(createAutomationForDestination)

function available(owner: AutomationOwnerRef = localOwner) {
  return automationActionAvailability({ owner, selector: owner.selector }, 'duplicate')
}

describe('owned automation duplication', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    list.mockResolvedValue({ automations: [source], items: [], orphanCount: 0, invalidRows: 0 })
    create.mockResolvedValue(makeAutomation({ id: 'copy', name: 'Latest name (copy)' }))
  })

  it.each(owners)('reads and creates only on the captured owner %j', async (owner) => {
    const result = await duplicateOwnedAutomation(available(owner), source.id, {})
    expect(result.status).toBe('ok')
    expect(list).toHaveBeenCalledExactlyOnceWith(owner)
    expect(create).toHaveBeenCalledExactlyOnceWith(
      owner.authority,
      expect.objectContaining({ name: 'Latest name (copy)', prompt: 'Latest prompt' }),
      { selector: owner.selector }
    )
  })

  it.each(['missing', 'failed'] as const)(
    'refuses a %s source read without creating',
    async (failure) => {
      if (failure === 'missing') {
        list.mockResolvedValue({ automations: [], items: [], orphanCount: 0, invalidRows: 0 })
      } else {
        list.mockRejectedValue(new Error('Host unavailable'))
      }
      expect((await duplicateOwnedAutomation(available(), source.id, {})).status).toBe('failed')
      expect(create).not.toHaveBeenCalled()
    }
  )

  it.each([
    { owner: null, selector: null },
    { owner: null, selector: { kind: 'orphan' as const, issue: 'removed' } },
    { owner: null, selector: { kind: 'ssh' as const, targetId: 'old-host' } }
  ])('refuses an unowned source %j before transport', async (captured) => {
    const result = await duplicateOwnedAutomation(
      automationActionAvailability(captured, 'duplicate'),
      source.id,
      {}
    )
    expect(result.status).toBe('blocked')
    expect(list).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('retries the same request after a transport failure even when the source changes', async () => {
    create.mockRejectedValueOnce(new Error('Response lost'))
    const operation: AutomationDuplicateOperation = {}
    expect((await duplicateOwnedAutomation(available(), source.id, operation)).status).toBe(
      'failed'
    )
    const firstInput = structuredClone(operation.input)
    list.mockResolvedValue({
      automations: [makeAutomation({ name: 'Edited after failure', prompt: 'Changed' })],
      items: [],
      orphanCount: 0,
      invalidRows: 0
    })
    expect((await duplicateOwnedAutomation(available(), source.id, operation)).status).toBe('ok')
    expect(create.mock.calls.map((call) => call[1])).toEqual([firstInput, firstInput])
  })

  it('recognizes a committed copy after a lost response even if the original was deleted', async () => {
    create.mockRejectedValueOnce(new Error('Response lost after commit'))
    const operation: AutomationDuplicateOperation = {}
    await duplicateOwnedAutomation(available(), source.id, operation)
    const copy = makeAutomation({ id: 'copy', creationKey: operation.input?.creationKey })
    list.mockResolvedValue({ automations: [copy], items: [], orphanCount: 0, invalidRows: 0 })
    expect(await duplicateOwnedAutomation(available(), source.id, operation)).toEqual({
      status: 'ok',
      value: copy
    })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('reports an owner conflict without retrying against another destination', async () => {
    create.mockRejectedValue(new AutomationOwnerConflictError('automation_destination_invalid'))
    const result = await duplicateOwnedAutomation(available(owners[1] ?? localOwner), source.id, {})
    expect(result.status).toBe('conflict')
    expect(create).toHaveBeenCalledTimes(1)
  })
})
