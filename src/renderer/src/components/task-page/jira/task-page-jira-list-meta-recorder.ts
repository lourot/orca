import type {
  JiraIssueListMeta,
  JiraIssueListResult
} from '../../../../../shared/jira/jira-issue-list-limit'
import type { JiraIssue } from '../../../../../shared/jira/jira-types'

/** Collects truncation metadata across the reads of one list load. */
export function createJiraListMetaRecorder() {
  let meta: JiraIssueListMeta = { truncated: false }
  let reads = 0
  return {
    record: ({ issues, ...readMeta }: JiraIssueListResult): JiraIssue[] => {
      reads += 1
      // Why: key-or-text search merges several reads, so only a single read's total is meaningful.
      meta = reads === 1 ? readMeta : { truncated: meta.truncated || readMeta.truncated }
      return issues
    },
    meta: () => meta
  }
}
