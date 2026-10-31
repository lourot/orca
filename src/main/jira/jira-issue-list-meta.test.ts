import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JiraClientForSite } from './authenticated-request'

const { getClients, jiraRequest } = vi.hoisted(() => ({
  getClients: vi.fn(),
  jiraRequest: vi.fn()
}))
vi.mock('./client', () => ({ getClients, clearToken: vi.fn(), isAuthError: () => false }))
vi.mock('./authenticated-request', () => ({
  apiBasePath: (site: { authType?: string }) =>
    site.authType === 'server' ? '/rest/api/2' : '/rest/api/3',
  jiraRequest,
  JiraApiError: class extends Error {}
}))
vi.mock('./jira-agile-fields', () => ({
  getAgileFieldIds: async () => ({}),
  agileFieldIdList: () => []
}))
vi.mock('./request-queue', () => ({ acquire: vi.fn(), release: vi.fn() }))

const { searchIssuesWithMeta } = await import('./jira-issue-search')

function site(id: string, authType: 'cloud' | 'server' = 'cloud'): JiraClientForSite {
  return {
    site: {
      id,
      authType,
      siteUrl: 'https://jira.example.com',
      email: '',
      displayName: id,
      accountId: 'me'
    },
    authorization: 'fixture'
  }
}

function page(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    key: `${prefix}-${index}`,
    fields: { summary: 'x', updated: '2020-01-01', status: { name: 'Open' } }
  }))
}

type SearchBody = { jql: string; maxResults?: number; startAt?: number; nextPageToken?: string }

/** Answers search pages from `pages`, and the approximate count from `count`. */
function serve(pages: (body: SearchBody, call: number) => unknown, count?: () => unknown): void {
  let call = 0
  jiraRequest.mockImplementation(async (_entry, path: string, init: { body: string }) => {
    const body: SearchBody = JSON.parse(init.body)
    if (path.endsWith('/approximate-count')) {
      if (!count) {
        throw new Error('unexpected count request')
      }
      return count()
    }
    call += 1
    return pages(body, call)
  })
}

function countRequests() {
  return jiraRequest.mock.calls.filter(([, path]) => String(path).endsWith('/approximate-count'))
}

describe('Jira issue list metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    jiraRequest.mockReset()
    getClients.mockReturnValue([site('cloud')])
  })

  it('marks a Cloud list cut at the ceiling and adds the approximate total without ORDER BY', async () => {
    serve(
      (_body, call) => ({ issues: page(`P${call}`, 100), nextPageToken: `t${call}` }),
      () => ({ count: 2340 })
    )
    const result = await searchIssuesWithMeta('project = A ORDER BY updated DESC', 200, 'cloud')
    expect({ ...result, issues: result.issues.length }).toEqual({
      issues: 200,
      truncated: true,
      total: 2340,
      totalIsApproximate: true
    })
    expect(JSON.parse(countRequests()[0][2].body)).toEqual({ jql: 'project = A' })
  })

  it('does not mark or count a Cloud list that ends exactly at the ceiling', async () => {
    serve((_body, call) =>
      call === 1
        ? { issues: page('P1', 100), nextPageToken: 't1' }
        : { issues: page('P2', 100), isLast: true }
    )
    const result = await searchIssuesWithMeta('project = A', 200, 'cloud')
    expect(result.truncated).toBe(false)
    expect(result.total).toBeUndefined()
    expect(countRequests()).toHaveLength(0)
  })

  it('keeps the list when Jira does not answer the approximate count', async () => {
    serve(
      (_body, call) => ({ issues: page(`P${call}`, 100), nextPageToken: `t${call}` }),
      () => {
        throw new Error('Error 404')
      }
    )
    const result = await searchIssuesWithMeta('project = A', 100, 'cloud')
    expect(result).toMatchObject({ truncated: true })
    expect(result.issues).toHaveLength(100)
    expect(result.total).toBeUndefined()
  })

  it.each([
    {
      name: 'a short page ends a Server list without a total',
      pages: (body: SearchBody) => ({
        issues: page(`S${body.startAt ?? 0}`, body.startAt ? 40 : 100)
      }),
      expected: { issues: 140, truncated: false },
      offsets: [undefined, 100]
    },
    {
      name: 'a Server total above the ceiling marks the list and reports the exact total',
      pages: (body: SearchBody) => ({ total: 450, issues: page(`S${body.startAt ?? 0}`, 100) }),
      expected: { issues: 200, truncated: true, total: 450 },
      offsets: [undefined, 100]
    }
  ])('$name', async ({ pages, expected, offsets }) => {
    getClients.mockReturnValue([site('server', 'server')])
    serve(pages)
    const result = await searchIssuesWithMeta('project = A', 200, 'server')
    expect({ ...result, issues: result.issues.length }).toEqual(expected)
    expect(jiraRequest.mock.calls.map(([, , init]) => JSON.parse(init.body).startAt)).toEqual(
      offsets
    )
    expect(countRequests()).toHaveLength(0)
  })

  it('returns the pages read before the deadline, marked as cut', async () => {
    vi.useFakeTimers()
    try {
      jiraRequest
        .mockResolvedValueOnce({ issues: page('P1', 100), nextPageToken: 't1' })
        .mockImplementationOnce(
          (_entry, _path, init: { signal: AbortSignal }) =>
            new Promise((_resolve, reject) => {
              init.signal.addEventListener('abort', () => reject(init.signal.reason), {
                once: true
              })
            })
        )
      const result = searchIssuesWithMeta('project = A', 1000, 'cloud')
      await vi.advanceTimersByTimeAsync(30_000)
      const settled = await result
      expect(settled.issues).toHaveLength(100)
      expect(settled.truncated).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('still rejects when the caller cancels after a page was read', async () => {
    const controller = new AbortController()
    jiraRequest
      .mockResolvedValueOnce({ issues: page('P1', 100), nextPageToken: 't1' })
      .mockImplementationOnce(
        (_entry, _path, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(init.signal.reason), {
              once: true
            })
            controller.abort()
          })
      )
    await expect(
      searchIssuesWithMeta('project = A', 1000, 'cloud', controller.signal)
    ).rejects.toBeDefined()
  })

  it.each([
    {
      name: 'sums totals across sites when every site knows its count',
      server: { total: 300, issues: page('S', 100) },
      expected: { truncated: true, total: 2640, totalIsApproximate: true }
    },
    {
      name: 'drops the total when a cut site has no count',
      server: { issues: page('S', 100) },
      expected: { truncated: true }
    }
  ])('$name', async ({ server, expected }) => {
    getClients.mockReturnValue([site('cloud'), site('server', 'server')])
    jiraRequest.mockImplementation(async (entry: JiraClientForSite, path: string) => {
      if (path.endsWith('/approximate-count')) {
        return { count: 2340 }
      }
      return entry.site.authType === 'server'
        ? server
        : { issues: page('C', 100), nextPageToken: 'more' }
    })
    const result = await searchIssuesWithMeta('project = A', 100, 'all')
    expect({ ...result, issues: result.issues.length }).toEqual({ issues: 100, ...expected })
  })
})
