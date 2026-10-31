import { getUtf8ByteLength } from '../utf8-byte-limits'
import type { JiraIssue } from './jira-types'

// Why: lists page through Jira until done; this ceiling keeps one load to about ten requests per site.
export const JIRA_ISSUE_LIST_MAX = 1000
// Why: older hosts clamp every issue read to 100 and read one page; the client infers truncation from it.
export const JIRA_LEGACY_ISSUE_LIST_LIMIT = 100
// Why: one-shot RPC replies share the relay's 1 MiB control queue (see file-range-read.ts), so stay well under it.
export const JIRA_REMOTE_ISSUE_LIST_MAX_BYTES = 512 * 1024
// Why: above the host's 30 s search deadline, so pages read before it expires still arrive.
export const JIRA_ISSUE_LIST_CLIENT_TIMEOUT_MS = 40_000
export const JIRA_ISSUE_LIST_META_RUNTIME_CAPABILITY = 'jira.issue-list-meta.v1' as const

/** An issue list plus whether Jira had more than it holds. */
export type JiraIssueListResult = {
  issues: JiraIssue[]
  /** Jira matched more issues than were loaded (ceiling, deadline or transfer budget). */
  truncated: boolean
  /** Total matches, when every site reported one. */
  total?: number
  /** The total includes a Jira Cloud approximate count. */
  totalIsApproximate?: boolean
}

export type JiraIssueListMeta = Omit<JiraIssueListResult, 'issues'>

/** Normalizes a host reply; a bare array comes from a host without list metadata, which clamps to the legacy limit. */
export function toJiraIssueListResult(
  value: JiraIssue[] | JiraIssueListResult,
  requestedLimit: number
): JiraIssueListResult {
  if (!Array.isArray(value)) {
    return value
  }
  const effectiveLimit = Math.min(requestedLimit, JIRA_LEGACY_ISSUE_LIST_LIMIT)
  return { issues: value, truncated: value.length >= effectiveLimit }
}

/** Keeps the longest prefix of the list whose JSON fits the byte budget. */
export function trimJiraIssueListToBytes(
  result: JiraIssueListResult,
  maxBytes: number
): JiraIssueListResult {
  let bytes = getUtf8ByteLength(JSON.stringify({ ...result, issues: [] }))
  for (let index = 0; index < result.issues.length; index += 1) {
    bytes += getUtf8ByteLength(JSON.stringify(result.issues[index])) + 1
    if (bytes > maxBytes) {
      return { ...result, issues: result.issues.slice(0, index), truncated: true }
    }
  }
  return result
}
