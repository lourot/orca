import { sortByUpdatedAtDescending } from '../../shared/updated-at-order'
import type { JiraIssueListResult } from '../../shared/jira/jira-issue-list-limit'
import { stripJiraJqlOrderBy } from '../../shared/jira/jira-jql-predicate'
import { jiraRequest, type JiraClientForSite } from './authenticated-request'
import { asFiniteNumber } from './jira-record-pages'

/** Jira Cloud's approximate match count; undefined when Jira does not answer. */
export async function readApproximateCount(
  entry: JiraClientForSite,
  jql: string,
  signal: AbortSignal
): Promise<number | undefined> {
  try {
    const result = await jiraRequest<{ count?: unknown }>(
      entry,
      '/rest/api/3/search/approximate-count',
      { method: 'POST', body: JSON.stringify({ jql: stripJiraJqlOrderBy(jql) }), signal }
    )
    return asFiniteNumber(result.count) ?? undefined
  } catch {
    // Why: the count only decorates the notice; never fail the list over it.
    return undefined
  }
}

/** Merges per-site results; a total is reported only when every site's count is known. */
export function mergeSiteResults(
  results: JiraIssueListResult[],
  limit: number,
  singleSite: boolean
): JiraIssueListResult {
  const merged = results.flatMap((result) => result.issues)
  const issues = singleSite
    ? merged.slice(0, limit)
    : sortByUpdatedAtDescending(merged).slice(0, limit)
  const truncated = results.some((result) => result.truncated) || merged.length > limit
  if (!truncated) {
    return { issues, truncated }
  }
  const siteTotals = results.map((result) =>
    result.truncated ? result.total : result.issues.length
  )
  if (siteTotals.some((total) => total === undefined)) {
    return { issues, truncated }
  }
  return {
    issues,
    truncated,
    total: siteTotals.reduce<number>((sum, total) => sum + (total ?? 0), 0),
    ...(results.some((result) => result.totalIsApproximate) ? { totalIsApproximate: true } : {})
  }
}
