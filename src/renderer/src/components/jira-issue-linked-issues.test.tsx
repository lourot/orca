// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { JiraIssue, JiraIssueLink } from '../../../shared/jira/jira-types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { JiraIssueLinkedIssues, groupJiraIssueLinks } from './jira-issue-linked-issues'

afterEach(cleanup)

const link = (relation: string, key: string): JiraIssueLink => ({
  relation,
  key,
  title: `Title ${key}`,
  statusName: 'To Do',
  statusCategoryKey: 'new',
  issueTypeName: 'Story'
})
const issue: JiraIssue = {
  id: 'ALP-1',
  key: 'ALP-1',
  siteId: 'site-a',
  title: 'Issue',
  url: 'https://example.atlassian.net/browse/ALP-1',
  project: { id: 'p', key: 'ALP', name: 'Alpha' },
  issueType: { id: 't', name: 'Story' },
  status: { id: '1', name: 'To Do', categoryKey: 'new', categoryName: 'To Do' },
  labels: [],
  parent: { key: 'ALP-9', title: 'Epic', issueTypeName: 'Epic' },
  subtasks: [link('subtask', 'ALP-5')],
  links: [link('relates to', 'ALP-4'), link('blocks', 'ALP-3'), link('is blocked by', 'ALP-2')],
  updatedAt: '2026-10-31T12:00:00.000Z',
  createdAt: '2026-10-31T12:00:00.000Z'
}

it('lists parent, sub-tasks, then blockers, blocked issues and other links', () => {
  expect(
    groupJiraIssueLinks(issue).map(({ label, links }) => [label, links.map(({ key }) => key)])
  ).toEqual([
    ['Parent', ['ALP-9']],
    ['Sub-tasks', ['ALP-5']],
    ['is blocked by', ['ALP-2']],
    ['blocks', ['ALP-3']],
    ['relates to', ['ALP-4']]
  ])
})

it('opens a linked issue on its own site, and shows nothing without links', () => {
  const onOpenIssueKey = vi.fn()
  const { container, rerender } = render(
    <TooltipProvider>
      <JiraIssueLinkedIssues issue={issue} onOpenIssueKey={onOpenIssueKey} />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: /ALP-2/ }))
  expect(onOpenIssueKey).toHaveBeenCalledWith('ALP-2', 'site-a')
  rerender(
    <TooltipProvider>
      <JiraIssueLinkedIssues
        issue={{ ...issue, parent: undefined, subtasks: undefined, links: undefined }}
        onOpenIssueKey={onOpenIssueKey}
      />
    </TooltipProvider>
  )
  expect(container.innerHTML).toBe('')
})
