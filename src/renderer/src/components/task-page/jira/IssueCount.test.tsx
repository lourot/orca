// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { JiraIssueListMeta } from '../../../../../shared/jira/jira-issue-list-limit'
import { TaskPageJiraIssueCount } from './IssueCount'

afterEach(cleanup)

it('shows the truncation notice only when Jira had more, with the total it knows', () => {
  const cases: [JiraIssueListMeta, string][] = [
    [{ truncated: false, total: 200 }, '200 shown'],
    [
      { truncated: true, total: 940, totalIsApproximate: true },
      '200 shownOnly the first 200 of about 940 loaded. Narrow the query to see the rest.'
    ],
    [
      { truncated: true, total: 450 },
      '200 shownOnly the first 200 of 450 loaded. Narrow the query to see the rest.'
    ],
    [{ truncated: true }, '200 shownOnly the first 200 loaded. Narrow the query to see the rest.']
  ]
  expect(
    cases.map(([meta]) => {
      const { container, unmount } = render(
        <TaskPageJiraIssueCount shown={200} loaded={200} meta={meta} />
      )
      const text = container.textContent
      unmount()
      return text
    })
  ).toEqual(cases.map(([, text]) => text))
})
