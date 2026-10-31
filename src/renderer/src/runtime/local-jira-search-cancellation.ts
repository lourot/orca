import type { JiraIssue, JiraSiteSelection } from '../../../shared/jira/jira-types'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { JiraIssueListResult } from '../../../shared/jira/jira-issue-list-limit'

type LocalJiraSearchArgs = { jql: string; limit?: number; siteId?: JiraSiteSelection }

function createJiraSearchAbortError(): Error {
  const error = new Error('Jira search aborted')
  error.name = 'AbortError'
  return error
}

async function runCancellableLocalSearch<T>(
  args: LocalJiraSearchArgs,
  signal: AbortSignal,
  search: (args: LocalJiraSearchArgs & { requestId: string }) => Promise<T>
): Promise<T> {
  if (signal.aborted) {
    throw createJiraSearchAbortError()
  }
  const requestId = createBrowserUuid()
  const handleAbort = (): void => {
    void window.api.jira.cancelSearchIssues({ requestId }).catch(() => {})
  }
  signal.addEventListener('abort', handleAbort, { once: true })
  try {
    const result = await search({ ...args, requestId })
    // Why: cancel can race ahead of main-process registration; drop late successes.
    if (signal.aborted) {
      throw createJiraSearchAbortError()
    }
    return result
  } finally {
    signal.removeEventListener('abort', handleAbort)
  }
}

/** Cancel superseded local searches in main or abandoned keystrokes hold shared Jira pool slots and stall the next query. */
export function searchLocalJiraIssues(
  args: LocalJiraSearchArgs,
  signal: AbortSignal
): Promise<JiraIssue[]> {
  return runCancellableLocalSearch(args, signal, window.api.jira.searchIssues)
}

/** Cancellable local search that also reports whether Jira had more issues. */
export function searchLocalJiraIssueList(
  args: LocalJiraSearchArgs,
  signal: AbortSignal
): Promise<JiraIssueListResult> {
  return runCancellableLocalSearch(args, signal, window.api.jira.searchIssuesWithMeta)
}
