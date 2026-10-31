import type { JiraIssueLink } from '../../shared/jira/jira-types'
import { asRecord, asString } from './jira-record-pages'

function statusCategoryKey(issue: Record<string, unknown>): string {
  return asString(asRecord(asRecord(asRecord(issue.fields).status).statusCategory).key)
}

/** A linked or child issue as the drawer lists it; null without a key. */
function mapLinkedIssue(value: unknown, relation: string): JiraIssueLink | null {
  const issue = asRecord(value)
  const key = asString(issue.key)
  if (!key) {
    return null
  }
  const fields = asRecord(issue.fields)
  return {
    relation,
    key,
    title: asString(fields.summary, key),
    statusName: asString(asRecord(fields.status).name),
    statusCategoryKey: statusCategoryKey(issue),
    issueTypeName: asString(asRecord(fields.issuetype).name) || undefined
  }
}

/**
 * Keys of open issues that block this one. On issue A, "B blocks A" arrives as a link whose
 * `inwardIssue` is B; `outwardIssue` links point the other way (issues A blocks).
 */
export function mapBlockedBy(value: unknown): string[] | undefined {
  const keys = (Array.isArray(value) ? value : []).flatMap((entry) => {
    const link = asRecord(entry)
    const type = asRecord(link.type)
    const blocker = asRecord(link.inwardIssue)
    const key = asString(blocker.key)
    const blocks = asString(type.name) === 'Blocks' || /blocked by/i.test(asString(type.inward))
    return key && blocks && statusCategoryKey(blocker) !== 'done' ? [key] : []
  })
  return keys.length ? keys : undefined
}

/** Every issue link, phrased from this issue's side: `type.inward` for an `inwardIssue`, else `type.outward`. */
export function mapIssueLinks(value: unknown): JiraIssueLink[] | undefined {
  const links = (Array.isArray(value) ? value : []).flatMap((entry) => {
    const link = asRecord(entry)
    const type = asRecord(link.type)
    const inward = link.inwardIssue !== undefined
    const relation = asString(inward ? type.inward : type.outward) || asString(type.name)
    const issue = mapLinkedIssue(inward ? link.inwardIssue : link.outwardIssue, relation)
    return issue ? [issue] : []
  })
  return links.length ? links : undefined
}

/** The issue's sub-tasks, from the `subtasks` field. */
export function mapSubtasks(value: unknown): JiraIssueLink[] | undefined {
  const subtasks = (Array.isArray(value) ? value : []).flatMap((entry) => {
    const issue = mapLinkedIssue(entry, 'subtask')
    return issue ? [issue] : []
  })
  return subtasks.length ? subtasks : undefined
}
