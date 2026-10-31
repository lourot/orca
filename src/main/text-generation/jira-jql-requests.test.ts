import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  generate: vi.fn(),
  cancel: vi.fn(),
  resolve: vi.fn(),
  status: vi.fn()
}))
vi.mock('../jira/client', () => ({ getStatus: mocks.status }))
vi.mock('./commit-message-agent-environment', () => ({
  prepareLocalCommitMessageAgentEnv: mocks.prepare
}))
vi.mock('./commit-message-text-generation', () => ({ resolveTextGenerationParams: mocks.resolve }))
vi.mock('./jira-jql-text-generation', () => ({
  generateJiraJqlFromContext: mocks.generate,
  cancelGenerateJiraJqlLocal: mocks.cancel
}))
import { cancelJiraJqlRequest, generateJiraJqlRequest } from './jira-jql-requests'
import { getDefaultSettings } from '../../shared/constants'
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const args = { instruction: 'only bugs', siteId: 'site-1', requestId: 'req-1' }
const settings = getDefaultSettings('/fixture')
const host = { getSettings: () => settings, getAgentEnvironment: () => undefined }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolve.mockReturnValue({
    ok: true,
    params: { agentId: 'custom', model: '', customAgentCommand: 'agent' }
  })
  mocks.prepare.mockResolvedValue({ ok: true })
  mocks.generate.mockResolvedValue({ success: true, jql: 'type = Bug' })
  mocks.status.mockReturnValue({ sites: [{ id: 'site-1' }, { id: 'site-2' }] })
})
describe('Jira JQL generation requests', () => {
  it('runs with the branch-name agent settings outside any repository', async () => {
    expect(await generateJiraJqlRequest(host, 'owner-1', args)).toEqual({
      success: true,
      jql: 'type = Bug'
    })
    expect(mocks.resolve).toHaveBeenCalledWith(settings, 'local', 'branchName', null)
    expect(mocks.generate).toHaveBeenCalledWith(
      args,
      expect.anything(),
      expect.objectContaining({ kind: 'local' })
    )
  })
  it('replaces an older request of the same owner without launching it', async () => {
    const slow = deferred<{ ok: true }>()
    mocks.prepare.mockReturnValueOnce(slow.promise)
    const old = generateJiraJqlRequest(host, 'owner-1', args)
    await generateJiraJqlRequest(host, 'owner-1', {
      ...args,
      requestId: 'req-2',
      instruction: 'new'
    })
    slow.resolve({ ok: true })
    expect(await old).toMatchObject({ canceled: true })
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(mocks.generate.mock.calls[0][0].instruction).toBe('new')
  })
  it.each([
    ['owner-2', args],
    ['owner-1', { ...args, siteId: 'site-2' }]
  ])('rejects a competing request from another owner or account', async (owner, other) => {
    const pending = deferred<{ success: true; jql: string }>()
    mocks.generate.mockReturnValue(pending.promise)
    const first = generateJiraJqlRequest(host, 'owner-1', args)
    await Promise.resolve()
    cancelJiraJqlRequest(owner, other)
    expect(await generateJiraJqlRequest(host, owner, other)).toMatchObject({ success: false })
    expect(mocks.cancel).not.toHaveBeenCalled()
    pending.resolve({ success: true, jql: 'first' })
    expect(await first).toMatchObject({ success: true, jql: 'first' })
  })
  it.each(['cancel', 'abort'])('does not spawn after %s during preparation', async (action) => {
    const pending = deferred<{ ok: true }>()
    mocks.prepare.mockReturnValue(pending.promise)
    const abort = new AbortController()
    const result = generateJiraJqlRequest(host, 'owner-1', args, abort.signal)
    if (action === 'cancel') {
      cancelJiraJqlRequest('owner-1', args)
    } else {
      abort.abort()
    }
    pending.resolve({ ok: true })
    expect(await result).toMatchObject({ canceled: true })
    expect(mocks.generate).not.toHaveBeenCalled()
  })
  it('rejects a Jira account absent on the execution host', async () => {
    expect(
      await generateJiraJqlRequest(host, 'owner-1', { ...args, siteId: 'unknown' })
    ).toMatchObject({ success: false })
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
})
