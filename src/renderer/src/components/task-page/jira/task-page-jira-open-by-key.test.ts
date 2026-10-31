import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JiraIssue } from '../../../../../shared/jira/jira-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import { openJiraIssueByKey } from './task-page-jira-open-by-key'

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

const source: TaskSourceContext = {
  kind: 'task-source',
  provider: 'jira',
  projectId: 'project',
  hostId: 'runtime:remote-owner'
}
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: openJiraIssueByKey only passes the issue through to `open`.
const blocker = { key: 'STA-7', siteId: 'site-a' } as JiraIssue

describe('openJiraIssueByKey', () => {
  beforeEach(() => toastError.mockReset())

  it('looks up a key missing from the caches through the page source, then opens it', async () => {
    const lookup = vi.fn().mockResolvedValue(blocker)
    const open = vi.fn()
    await openJiraIssueByKey({
      state: { jiraIssueCache: {}, jiraSearchCache: {}, lookupJiraIssueSummary: lookup },
      sourceContext: source,
      key: 'STA-7',
      siteId: 'site-a',
      open
    })
    expect(lookup).toHaveBeenCalledWith(source, 'STA-7', 'site-a')
    expect(open).toHaveBeenCalledWith(blocker)
    expect(toastError).not.toHaveBeenCalled()
  })

  it.each([
    { label: 'not found', lookup: vi.fn().mockResolvedValue(null) },
    { label: 'failed', lookup: vi.fn().mockRejectedValue(new Error('offline')) }
  ])('says it could not open the issue when the lookup $label', async ({ lookup }) => {
    const open = vi.fn()
    await openJiraIssueByKey({
      state: { jiraIssueCache: {}, jiraSearchCache: {}, lookupJiraIssueSummary: lookup },
      sourceContext: source,
      key: 'STA-7',
      siteId: 'site-a',
      open
    })
    expect(open).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('STA-7'))
  })
})
