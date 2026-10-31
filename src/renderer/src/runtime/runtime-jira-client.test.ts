// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  jiraSearchIssueListForTarget,
  jiraSearchIssuesForTarget,
  jiraStatusForTarget,
  jiraListAssignableUsersForProject
} from './runtime-jira-client'
import { clearJiraImageCache } from './runtime-jira-image-cache'
import { clearRuntimeCompatibilityCacheForTests } from './runtime-rpc-client'
import { createCompatibleRuntimeStatusResponse } from './runtime-compatibility-test-fixture'
import { JIRA_ISSUE_LIST_META_RUNTIME_CAPABILITY } from '../../../shared/jira/jira-issue-list-limit'
const jiraSearchIssuesLocal = vi.fn()
const jiraStatusLocal = vi.fn()
const jiraListAssignableUsersLocal = vi.fn()
const jiraSearchUsersLocal = vi.fn()
const jiraProjectUsersLocal = vi.fn()
const jiraCreateIssueLocal = vi.fn()
const jiraReadStatusLocal = vi.fn()
const jiraLookupIssueSummaryLocal = vi.fn()
const jiraCancelIssueSummaryLocal = vi.fn()
const runtimeCall = vi.fn()
const runtimeSubscribe = vi.fn()

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  jiraSearchIssuesLocal.mockReset()
  jiraStatusLocal.mockReset()
  jiraListAssignableUsersLocal.mockReset()
  jiraSearchUsersLocal.mockReset()
  jiraProjectUsersLocal.mockReset()
  jiraCreateIssueLocal.mockReset()
  jiraReadStatusLocal.mockReset()
  jiraLookupIssueSummaryLocal.mockReset()
  jiraCancelIssueSummaryLocal.mockReset()
  runtimeCall.mockReset()
  runtimeSubscribe.mockReset()
  vi.stubGlobal('window', {
    api: {
      jira: {
        status: jiraStatusLocal,
        readStatus: jiraReadStatusLocal,
        lookupIssueSummary: jiraLookupIssueSummaryLocal,
        cancelIssueSummary: jiraCancelIssueSummaryLocal,
        searchIssues: jiraSearchIssuesLocal,
        listAssignableUsers: jiraListAssignableUsersLocal,
        searchUsers: jiraSearchUsersLocal,
        listAssignableUsersForProject: jiraProjectUsersLocal,
        createIssue: jiraCreateIssueLocal
      },
      runtimeEnvironments: {
        call: runtimeCall,
        subscribe: runtimeSubscribe
      }
    }
  })
})

afterEach(() => {
  clearJiraImageCache()
  vi.unstubAllGlobals()
})
describe('runtime Jira client search bounds', () => {
  it('keeps explicit Jira status and search on their owner with the selected site and query bounds', async () => {
    runtimeCall.mockImplementation(async (args: { method: string }) => {
      if (args.method === 'status.get') {
        return createCompatibleRuntimeStatusResponse()
      }
      return {
        id: 'rpc-result',
        ok: true,
        result:
          args.method === 'jira.status'
            ? { connected: true, viewer: null, selectedSiteId: 'all' }
            : [],
        _meta: { runtimeId: 'source-owner-runtime' }
      }
    })
    const target = { kind: 'environment', environmentId: 'source-owner' } as const
    await expect(jiraStatusForTarget(target)).resolves.toMatchObject({
      connected: true,
      selectedSiteId: 'all'
    })
    await jiraSearchIssuesForTarget(target, 'text ~ "login*"', 12, 'all')
    await jiraSearchIssuesForTarget(target, 'secret-token-value'.repeat(1024), 12)
    expect(runtimeCall).toHaveBeenCalledTimes(3)
    expect(runtimeCall).toHaveBeenLastCalledWith({
      selector: 'source-owner',
      method: 'jira.searchIssues',
      params: { jql: 'text ~ "login*"', limit: 12, siteId: 'all' },
      timeoutMs: 30_000
    })
    expect(jiraStatusLocal).not.toHaveBeenCalled()
    expect(jiraSearchIssuesLocal).not.toHaveBeenCalled()
  })

  it('uses project-scoped search locally and rejects oversized queries before IPC', async () => {
    jiraProjectUsersLocal.mockResolvedValue([])
    await jiraListAssignableUsersForProject({ kind: 'local' }, '100', 'Ada', 'site-1')
    expect(jiraProjectUsersLocal).toHaveBeenCalledWith({
      projectIdOrKey: '100',
      query: 'Ada',
      siteId: 'site-1'
    })
    await jiraListAssignableUsersForProject({ kind: 'local' }, '100', 'x'.repeat(20_000), 'site-1')
    expect(jiraProjectUsersLocal).toHaveBeenCalledTimes(1)
  })
})

describe('runtime Jira client issue list metadata', () => {
  it.each([
    {
      name: 'asks a capable host for metadata and passes it through',
      capable: true,
      reply: { issues: [], truncated: true, total: 2340, totalIsApproximate: true },
      sentMeta: true,
      expected: { issues: [], truncated: true, total: 2340, totalIsApproximate: true }
    },
    {
      name: 'infers truncation from an older host that returns at most 100 issues',
      capable: false,
      reply: Array.from({ length: 100 }, (_, index) => ({ key: `OLD-${index}` })),
      sentMeta: false,
      expected: { truncated: true }
    }
  ])('$name', async ({ capable, reply, sentMeta, expected }) => {
    const searchParams: Record<string, unknown>[] = []
    runtimeCall.mockImplementation(
      async (args: { method: string; params?: Record<string, unknown> }) => {
        if (args.method === 'status.get') {
          const status = createCompatibleRuntimeStatusResponse()
          return capable
            ? status
            : {
                ...status,
                result: {
                  ...status.result,
                  capabilities: (status.result.capabilities ?? []).filter(
                    (capability) => capability !== JIRA_ISSUE_LIST_META_RUNTIME_CAPABILITY
                  )
                }
              }
        }
        searchParams.push(args.params ?? {})
        return { id: 'rpc-result', ok: true, result: reply, _meta: { runtimeId: 'remote' } }
      }
    )
    const target = { kind: 'environment', environmentId: 'remote' } as const
    const result = await jiraSearchIssueListForTarget(target, 'project = A', 1000)
    expect(result).toMatchObject(expected)
    expect(searchParams.at(-1)?.includeMeta === true).toBe(sentMeta)
  })
})
