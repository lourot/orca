import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { JiraIssue } from '../../../../../shared/jira/jira-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import type { AppState } from '@/store'
import { findTaskPageJiraIssue } from './task-page-jira-cache-selectors'

/**
 * Opens an issue known only by key (a blocker, a linked issue): from the loaded caches when
 * there, otherwise through the summary lookup, which routes by the source's owner. The drawer
 * then loads the full issue itself. Uses the owner-routed lookup on purpose: `fetchJiraIssue`
 * takes no source context and would read a remote owner's issue from the wrong host.
 */
export async function openJiraIssueByKey(args: {
  state: Pick<AppState, 'jiraIssueCache' | 'jiraSearchCache' | 'lookupJiraIssueSummary'>
  sourceContext: TaskSourceContext | null
  key: string
  siteId: string | undefined
  open: (issue: JiraIssue) => void
}): Promise<void> {
  const { state, sourceContext, key, siteId, open } = args
  const known = findTaskPageJiraIssue(state.jiraIssueCache, state.jiraSearchCache, key, {
    sourceContext,
    siteId: siteId ?? null
  })
  let issue = known
  if (!issue && sourceContext && siteId) {
    issue = await state.lookupJiraIssueSummary(sourceContext, key, siteId).catch(() => null)
  }
  if (issue) {
    open(issue)
    return
  }
  toast.error(translate('taskProviders.openIssueFailed', 'Couldn’t open {{key}}', { key }))
}
