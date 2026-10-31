import type {
  JiraIssue,
  JiraIssueFilter,
  JiraIssueListFilters,
  JiraSiteSelection
} from '../../../shared/jira/jira-types'
import {
  JIRA_ISSUE_LIST_CLIENT_TIMEOUT_MS,
  JIRA_ISSUE_LIST_META_RUNTIME_CAPABILITY,
  toJiraIssueListResult,
  type JiraIssueListResult
} from '../../../shared/jira/jira-issue-list-limit'
import { JIRA_CURRENT_SPRINT_RUNTIME_CAPABILITY } from '../../../shared/jira/jira-detail-capabilities'
import {
  JIRA_STATUS_FILTER_RUNTIME_CAPABILITY,
  JIRA_STATUS_FILTER_UPDATE_REQUIRED
} from '../../../shared/jira/jira-quick-filters'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'
import { searchLocalJiraIssueList } from './local-jira-search-cancellation'
import {
  assertRuntimeEnvironmentCapability,
  callRuntimeRpc,
  runtimeEnvironmentSupportsCapability
} from './runtime-rpc-client'
import { isRuntimeProviderSearchQueryWithinLimit } from './runtime-provider-search-bounds'
import { getJiraRuntimeTarget, type RuntimeJiraSettings } from './runtime-jira-target'

/** Older remote servers cannot apply these list filters; fail with an update hint instead. */
export async function assertJiraListFilterCapabilities(
  environmentId: string,
  filters?: JiraIssueListFilters
): Promise<void> {
  if (filters?.currentSprint) {
    await assertRuntimeEnvironmentCapability(
      environmentId,
      JIRA_CURRENT_SPRINT_RUNTIME_CAPABILITY,
      'Update the remote Orca server to filter preset issues by current sprint.'
    )
  }
  if (filters?.statuses?.length) {
    await assertRuntimeEnvironmentCapability(
      environmentId,
      JIRA_STATUS_FILTER_RUNTIME_CAPABILITY,
      JIRA_STATUS_FILTER_UPDATE_REQUIRED,
      15_000
    )
  }
}

export async function jiraSearchIssueList(
  settings: RuntimeJiraSettings,
  jql: string,
  limit: number,
  siteId?: JiraSiteSelection | null,
  signal?: AbortSignal
): Promise<JiraIssueListResult> {
  return jiraSearchIssueListForTarget(getJiraRuntimeTarget(settings), jql, limit, siteId, signal)
}

/** Tasks-page search: the host's full ceiling plus whether Jira had more issues. */
export async function jiraSearchIssueListForTarget(
  target: RuntimeClientTarget,
  jql: string,
  limit: number,
  siteId?: JiraSiteSelection | null,
  signal?: AbortSignal
): Promise<JiraIssueListResult> {
  if (!isRuntimeProviderSearchQueryWithinLimit(jql)) {
    return { issues: [], truncated: false }
  }
  const args = { jql, limit, siteId: siteId ?? undefined }
  if (target.kind === 'environment') {
    const includeMeta = await runtimeEnvironmentSupportsCapability(
      target.environmentId,
      JIRA_ISSUE_LIST_META_RUNTIME_CAPABILITY
    )
    const reply = await callRuntimeRpc<JiraIssue[] | JiraIssueListResult>(
      target,
      'jira.searchIssues',
      includeMeta ? { ...args, includeMeta } : args,
      { timeoutMs: JIRA_ISSUE_LIST_CLIENT_TIMEOUT_MS, signal }
    )
    return toJiraIssueListResult(reply, limit)
  }
  return signal
    ? searchLocalJiraIssueList(args, signal)
    : window.api.jira.searchIssuesWithMeta(args)
}

/** Tasks-page preset list: the host's full ceiling plus whether Jira had more issues. */
export async function jiraListIssueListForTarget(
  target: RuntimeClientTarget,
  filter: JiraIssueFilter | undefined,
  limit: number,
  siteId?: JiraSiteSelection | null,
  filters?: JiraIssueListFilters
): Promise<JiraIssueListResult> {
  const args = { filter, limit, siteId: siteId ?? undefined, ...(filters ? { filters } : {}) }
  if (target.kind === 'environment') {
    await assertJiraListFilterCapabilities(target.environmentId, filters)
    const includeMeta = await runtimeEnvironmentSupportsCapability(
      target.environmentId,
      JIRA_ISSUE_LIST_META_RUNTIME_CAPABILITY
    )
    const reply = await callRuntimeRpc<JiraIssue[] | JiraIssueListResult>(
      target,
      'jira.listIssues',
      includeMeta ? { ...args, includeMeta } : args,
      { timeoutMs: JIRA_ISSUE_LIST_CLIENT_TIMEOUT_MS }
    )
    return toJiraIssueListResult(reply, limit)
  }
  return window.api.jira.listIssuesWithMeta(args)
}
