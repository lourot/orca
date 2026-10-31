import { sortByUpdatedAtDescending } from '../../shared/updated-at-order'
import type {
  JiraIssue,
  JiraIssueFilter,
  JiraIssueListFilters,
  JiraSiteSelection
} from '../../shared/jira/jira-types'
import { buildJiraPresetJql } from '../../shared/jira/jira-preset-jql'
import { acquire, release } from './request-queue'
import { apiBasePath, jiraRequest, type JiraClientForSite } from './authenticated-request'
import { clearToken, getClients, isAuthError } from './client'
import { ISSUE_LIST_FIELDS, mapJiraIssue, type JiraAgileFieldIds } from './jira-issue-mapping'
import { agileFieldIdList, getAgileFieldIds } from './jira-agile-fields'
import {
  JIRA_ISSUE_LIST_MAX,
  type JiraIssueListResult
} from '../../shared/jira/jira-issue-list-limit'
import { mergeSiteResults, readApproximateCount } from './jira-issue-list-meta'
import { asFiniteNumber, type JiraSearchResponse } from './jira-record-pages'
import { readProjectsForClient } from './jira-project-queries'
import {
  requireStrictJiraSite,
  shouldSurfaceSiteFailure,
  toIssueSearchFailureError,
  withJiraDeadline,
  type JiraIssueSearchFailure
} from './jira-read-failure'

const ISSUE_SEARCH_TIMEOUT_MS = 30_000
const PROJECTS_PER_QUERY = 100
// Jira Cloud returns at most 100 issues per page when fields are requested.
const SEARCH_PAGE_SIZE = 100
type JiraIssueQuery = { filter: JiraIssueFilter; filters?: JiraIssueListFilters } | { jql: string }

function clampLimit(limit: number | undefined, fallback = 30): number {
  return Math.min(
    Math.max(1, Number.isFinite(limit) ? Number(limit) : fallback),
    JIRA_ISSUE_LIST_MAX
  )
}

function sortAndLimitIssues(issues: JiraIssue[], limit: number): JiraIssue[] {
  return sortByUpdatedAtDescending(issues).slice(0, limit)
}

async function readIssuesForClient(
  entry: JiraClientForSite,
  query: JiraIssueQuery,
  limit: number,
  agileFields: JiraAgileFieldIds,
  signal: AbortSignal,
  deadlineExpired: () => boolean
): Promise<JiraIssueListResult> {
  if ('jql' in query) {
    return searchIssuesForClient(entry, query.jql, limit, agileFields, signal, deadlineExpired)
  }
  const jql = buildJiraPresetJql(query.filter, query.filters)
  if (query.filter !== 'all' || entry.site.authType === 'server') {
    return searchIssuesForClient(entry, jql, limit, agileFields, signal, deadlineExpired)
  }
  const projects = await readProjectsForClient(entry, signal, true)
  const projectIds = [...new Set(projects.map((project) => project.id || project.key))]
  if (projectIds.some((id) => !id)) {
    throw new Error('Jira returned a project without an ID or key.')
  }
  const issues: JiraIssue[] = []
  let truncated = false
  // Cloud requires a search restriction; project bounds preserve older open work.
  for (let start = 0; start < projectIds.length; start += PROJECTS_PER_QUERY) {
    const ids = projectIds.slice(start, start + PROJECTS_PER_QUERY).map((id) => JSON.stringify(id))
    try {
      const group = await searchIssuesForClient(
        entry,
        `project in (${ids.join(', ')}) AND ${jql}`,
        limit,
        agileFields,
        signal,
        deadlineExpired,
        true
      )
      issues.push(...group.issues)
      truncated ||= group.truncated
    } catch (error) {
      if (!deadlineExpired() || issues.length === 0) {
        throw error
      }
      truncated = true
      break
    }
  }
  return {
    issues: sortAndLimitIssues(issues, limit),
    truncated: truncated || issues.length > limit
  }
}

async function searchIssuesForClient(
  entry: JiraClientForSite,
  jql: string,
  limit: number,
  agileFields: JiraAgileFieldIds,
  signal: AbortSignal,
  deadlineExpired: () => boolean,
  collectPages = false
): Promise<JiraIssueListResult> {
  // Server/DC only has the classic /search resource; /search/jql is Cloud-only.
  const isServer = entry.site.authType === 'server'
  const searchPath = isServer ? `${apiBasePath(entry.site)}/search` : '/rest/api/3/search/jql'
  const issues: JiraIssue[] = []
  const seenTokens = new Set<string>()
  let nextPageToken: string | undefined
  for (let page = 0; page < 100; page += 1) {
    const requested = Math.min(limit - issues.length, SEARCH_PAGE_SIZE)
    let result: JiraSearchResponse
    try {
      result = await jiraRequest<JiraSearchResponse>(entry, searchPath, {
        method: 'POST',
        body: JSON.stringify({
          jql,
          maxResults: requested,
          fields: [...ISSUE_LIST_FIELDS, ...agileFieldIdList(agileFields)],
          ...(isServer && issues.length > 0 ? { startAt: issues.length } : {}),
          ...(nextPageToken ? { nextPageToken } : {})
        }),
        signal
      })
    } catch (error) {
      // Why: the shared deadline expired mid-paging; the pages already read are still a valid prefix.
      if (deadlineExpired() && issues.length > 0) {
        return { issues, truncated: true }
      }
      throw error
    }
    if (collectPages && !Array.isArray(result.issues)) {
      throw new Error('Jira returned an invalid issue page.')
    }
    const pageIssues = result.issues ?? []
    issues.push(
      ...pageIssues.map((issue) => mapJiraIssue(entry.site, issue, undefined, agileFields))
    )
    // Classic search pages by offset and reports a total instead of page tokens.
    const total = isServer ? (asFiniteNumber(result.total) ?? undefined) : undefined
    if (issues.length >= limit || result.isLast === true) {
      const truncated =
        result.isLast !== true &&
        (isServer ? total === undefined || total > limit : Boolean(result.nextPageToken))
      if (!truncated) {
        return { issues: issues.slice(0, limit), truncated }
      }
      if (isServer) {
        return { issues: issues.slice(0, limit), truncated, ...(total ? { total } : {}) }
      }
      const approximate = collectPages ? undefined : await readApproximateCount(entry, jql, signal)
      return {
        issues: issues.slice(0, limit),
        truncated,
        ...(approximate === undefined ? {} : { total: approximate, totalIsApproximate: true })
      }
    }
    if (isServer) {
      // Why: without a total, a page shorter than requested is the end; an empty page is not required.
      const reachedEnd =
        total === undefined ? pageIssues.length < requested : issues.length >= total
      if (pageIssues.length === 0 || reachedEnd) {
        return { issues, truncated: false }
      }
      continue
    }
    if (!result.nextPageToken) {
      if (collectPages && result.isLast === false) {
        throw new Error('Jira returned an incomplete issue page.')
      }
      return { issues: issues.slice(0, limit), truncated: false }
    }
    if (typeof result.nextPageToken !== 'string' || seenTokens.has(result.nextPageToken)) {
      throw new Error('Jira returned an invalid or repeated issue page token.')
    }
    nextPageToken = result.nextPageToken
    seenTokens.add(nextPageToken)
  }
  throw new Error('Jira issue search exceeded the page limit. Select a project with JQL instead.')
}

/** Preset issues with whether Jira had more, for the Tasks page. */
export async function listIssuesWithMeta(
  filter: JiraIssueFilter = 'assigned',
  limit = 30,
  siteId?: JiraSiteSelection | null,
  strict = false,
  filters?: JiraIssueListFilters
): Promise<JiraIssueListResult> {
  return runIssueSearch({ filter, filters }, limit, siteId, undefined, strict)
}

export async function listIssues(
  filter: JiraIssueFilter = 'assigned',
  limit = 30,
  siteId?: JiraSiteSelection | null,
  strict = false,
  filters?: JiraIssueListFilters
): Promise<JiraIssue[]> {
  return (await listIssuesWithMeta(filter, limit, siteId, strict, filters)).issues
}

/** JQL search results with whether Jira had more, for the Tasks page. */
export async function searchIssuesWithMeta(
  jql: string,
  limit = 30,
  siteId?: JiraSiteSelection | null,
  signal?: AbortSignal,
  strict = false
): Promise<JiraIssueListResult> {
  return runIssueSearch({ jql: jql.trim() }, limit, siteId, signal, strict)
}

export async function searchIssues(
  jql: string,
  limit = 30,
  siteId?: JiraSiteSelection | null,
  signal?: AbortSignal,
  strict = false
): Promise<JiraIssue[]> {
  return (await searchIssuesWithMeta(jql, limit, siteId, signal, strict)).issues
}

async function runIssueSearch(
  query: JiraIssueQuery,
  limit: number,
  siteId?: JiraSiteSelection | null,
  signal?: AbortSignal,
  strict = false
): Promise<JiraIssueListResult> {
  const entries = getClients(siteId)
  requireStrictJiraSite(entries, siteId, strict)
  if (entries.length === 0 || ('jql' in query && !query.jql)) {
    return { issues: [], truncated: false }
  }
  const safeLimit = clampLimit(limit)
  const failures: (JiraIssueSearchFailure | undefined)[] = Array.from({ length: entries.length })
  const surfaceSiteFailure = shouldSurfaceSiteFailure(siteId, entries.length)
  const results = await withJiraDeadline(signal, ISSUE_SEARCH_TIMEOUT_MS, (requestSignal) => {
    const deadlineExpired = (): boolean => requestSignal.aborted && signal?.aborted !== true
    return Promise.all(
      entries.map(async (entry, index): Promise<JiraIssueListResult> => {
        // Discovery owns a slot, so finish it before acquiring the search slot.
        const agileFields = await getAgileFieldIds(entry, requestSignal)
        // Pass cancellation through queue admission so abandoned searches do not occupy the shared pool.
        await acquire(requestSignal)
        try {
          return await readIssuesForClient(
            entry,
            query,
            safeLimit,
            agileFields,
            requestSignal,
            deadlineExpired
          )
        } catch (error) {
          if (requestSignal.aborted) {
            // Abandoned by the caller: not a site failure, so don't clear tokens or mask a real one.
            throw error
          }
          const authFailure = isAuthError(error)
          if (authFailure) {
            clearToken(entry.site.id)
          }
          if (surfaceSiteFailure) {
            throw toIssueSearchFailureError(error)
          }
          console.warn('[jira] searchIssues failed:', error)
          failures[index] = { error: toIssueSearchFailureError(error), auth: authFailure }
          return { issues: [], truncated: false }
        } finally {
          release()
        }
      })
    )
  })
  // Preserve partial success, including empty results; report failure only when every connected site fails.
  const recordedFailures = failures.filter(
    (failure): failure is JiraIssueSearchFailure => failure !== undefined
  )
  if (recordedFailures.length === entries.length) {
    throw (recordedFailures.find((failure) => !failure.auth) ?? recordedFailures[0]).error
  }
  return mergeSiteResults(results, safeLimit, entries.length === 1)
}
