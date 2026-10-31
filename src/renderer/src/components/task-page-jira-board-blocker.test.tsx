// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { JiraIssue } from '../../../shared/jira/jira-types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TaskPageJiraBoard } from './task-page-jira-board'

afterEach(cleanup)

it('opens the blocker from its chip without opening the card', () => {
  const issue: JiraIssue = {
    id: 'STA-1',
    key: 'STA-1',
    siteId: 'site-a',
    title: 'Blocked card',
    url: 'https://example.atlassian.net/browse/STA-1',
    project: { id: 'p1', key: 'STA', name: 'Stably' },
    issueType: { id: 't1', name: 'Bug' },
    status: { id: '1', name: 'To Do', categoryKey: 'new', categoryName: 'To Do' },
    labels: [],
    blockedBy: ['STA-7'],
    updatedAt: '2026-08-07T12:00:00.000Z',
    createdAt: '2026-08-07T12:00:00.000Z'
  }
  const onOpenIssue = vi.fn()
  const onOpenIssueKey = vi.fn()
  render(
    <TooltipProvider>
      <TaskPageJiraBoard
        formatUpdatedAt={() => '2d'}
        issues={[issue]}
        onMoveIssue={async () => {}}
        onOpenIssue={onOpenIssue}
        onOpenIssueKey={onOpenIssueKey}
        onStartWorkspace={() => {}}
        selectedIssue={null}
        showSiteContext={false}
        statusOrder={null}
        updatingIssueKeys={new Set()}
      />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Open STA-7' }))
  expect(onOpenIssueKey).toHaveBeenCalledWith('STA-7', 'site-a')
  expect(onOpenIssue).not.toHaveBeenCalled()
})
