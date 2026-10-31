import { describe, expect, it } from 'vitest'
import {
  JIRA_LEGACY_ISSUE_LIST_LIMIT,
  toJiraIssueListResult,
  trimJiraIssueListToBytes,
  type JiraIssueListResult
} from './jira-issue-list-limit'
import type { JiraIssue } from './jira-types'

function issue(key: string, title = 'x'): JiraIssue {
  return {
    id: key,
    key,
    title,
    url: `https://jira.invalid/browse/${key}`,
    project: { id: 'p', key: 'P', name: 'P' },
    issueType: { id: 't', name: 'Task' },
    status: { id: 's', name: 'Open', categoryKey: 'new', categoryName: 'To Do' },
    labels: [],
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01'
  }
}

describe('Jira issue list limits', () => {
  it('trims the list to the longest prefix that fits the byte budget', () => {
    const small = [issue('A-1'), issue('A-2'), issue('A-3')]
    const oneBytes = JSON.stringify(small[0]).length + 1
    const base = JSON.stringify({ issues: [], truncated: false }).length
    const cases: [string, JiraIssueListResult, number, { kept: number; truncated: boolean }][] = [
      ['under budget', { issues: small, truncated: false }, 10_000, { kept: 3, truncated: false }],
      [
        'over budget',
        { issues: small, truncated: false },
        base + 2 * oneBytes,
        { kept: 2, truncated: true }
      ],
      [
        'one oversized issue',
        { issues: [issue('B-1', 'y'.repeat(5000)), ...small], truncated: false },
        base + 1000,
        { kept: 0, truncated: true }
      ]
    ]
    expect(
      cases.map(([, result, budget]) => {
        const trimmed = trimJiraIssueListToBytes(result, budget)
        return { kept: trimmed.issues.length, truncated: trimmed.truncated }
      })
    ).toEqual(cases.map(([, , , expected]) => expected))
  })

  it('infers truncation for a bare array from what an older host could return', () => {
    const atLegacyCap = Array.from({ length: JIRA_LEGACY_ISSUE_LIST_LIMIT }, (_, index) =>
      issue(`L-${index}`)
    )
    const withMeta: JiraIssueListResult = { issues: [issue('M-1')], truncated: true, total: 9 }
    expect([
      toJiraIssueListResult([issue('A-1')], 1000).truncated,
      toJiraIssueListResult(atLegacyCap, 1000).truncated,
      toJiraIssueListResult([issue('A-1'), issue('A-2')], 2).truncated,
      toJiraIssueListResult(withMeta, 1000)
    ]).toEqual([false, true, true, withMeta])
  })
})
