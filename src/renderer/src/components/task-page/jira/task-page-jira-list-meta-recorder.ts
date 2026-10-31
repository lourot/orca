import type {
  JiraIssueListMeta,
  JiraIssueListResult
} from '../../../../../shared/jira/jira-issue-list-limit'
import type { JiraIssue } from '../../../../../shared/jira/jira-types'
import { hasJiraJqlOrderBy } from '../../../../../shared/jira/jira-jql-predicate'

/** Collects truncation metadata and the last JQL sent across the reads of one list load. */
export function createJiraListMetaRecorder() {
  let meta: JiraIssueListMeta = { truncated: false }
  let reads = 0
  let lastJql: string | null = null
  return {
    /** `jql` is absent for preset host lists. */
    record: ({ issues, ...readMeta }: JiraIssueListResult, jql?: string): JiraIssue[] => {
      reads += 1
      // Why: the last read is the one shown (a key hit, a text fallback after rejected JQL).
      lastJql = jql ?? null
      // Why: key-or-text search merges several reads, so only a single read's total is meaningful.
      meta = reads === 1 ? readMeta : { truncated: meta.truncated || readMeta.truncated }
      return issues
    },
    meta: () => meta,
    /** Whether the issues keep the query's own ORDER BY; preset host lists send ORDER BY updated DESC. */
    inQueryOrder: () => lastJql === null || hasJiraJqlOrderBy(lastJql)
  }
}
