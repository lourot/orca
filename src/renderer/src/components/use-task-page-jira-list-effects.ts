import { translate } from '@/i18n/i18n'
import { isRuntimeProviderSearchQueryWithinLimit } from '@/runtime/runtime-provider-search-bounds'
import { withCurrentSprintClause } from '../../../shared/jira/jira-jql-predicate'
import {
  buildJiraStatusCatalog,
  getJiraStatusCatalogScopeKey
} from './task-page/jira/task-page-jira-status-catalog'
import type { TaskPageLinearCollectionEffectsModel } from './task-page/linear/use-task-page-linear-collection-effects'
import { useEffect, useMemo, useRef } from 'react'
import {
  getSingleJiraProjectScope,
  getTaskPageJiraStatusOrderScopeKey,
  getTaskPageJiraStatusOrderRuntimeScopeKey,
  loadTaskPageJiraProjectStatusOrder
} from '@/components/task-page/jira/task-page-jira-status-order'
import { createTaskPageJiraLoadFailureState } from '@/components/task-page/jira/task-page-jira-load-state'
import { searchTaskPageJiraIssues } from '@/components/task-page/jira/task-page-jira-search'
import { JIRA_ISSUE_LIST_MAX } from '../../../shared/jira/jira-issue-list-limit'
import { createJiraListMetaRecorder } from './task-page/jira/task-page-jira-list-meta-recorder'
import { assertJiraFavouriteOnSite } from './task-page/jira/task-page-jira-favourite-site'
import { useTaskSearchDebouncedApply } from './task-page/use-task-search-debounced-apply'
import { readLinkedJiraIssues } from './task-page/jira/task-page-jira-linked-issues'
import { ipcOrRuntimeTargetForHostId } from '@/runtime/runtime-client-target'
import { buildJiraPresetJql } from '../../../shared/jira/jira-preset-jql'
import { restrictJiraQueryToProject } from '../../../shared/jira/jira-project-reference'
export function useTaskPageJiraListEffects(model: TaskPageLinearCollectionEffectsModel) {
  const {
    accountBackedTaskSourceHostId,
    jiraHasWorkspace,
    linkedJiraIssueRefs,
    linkedJiraIssueRefsSignature,
    setTaskResumeState,
    searchJiraIssues,
    searchJiraIssueList,
    listJiraIssueList,
    jiraConnected,
    selectedJiraSiteId,
    taskSource,
    jiraTaskSourceContext,
    jiraTaskSourceScopeKey,
    jiraSearchPersistReadyRef,
    taskResumeApplied,
    selectedJiraIssueKey,
    setSelectedJiraIssueKey,
    selectedJiraIssueFallback,
    setSelectedJiraIssueFallback,
    setJiraIssues,
    setJiraIssuesInQueryOrder,
    setJiraIssueListMeta,
    setJiraLoading,
    setJiraError,
    setJiraErrorDetailsOpen,
    setJiraJqlRejection,
    jiraSearchInput,
    appliedJiraSearch,
    setAppliedJiraSearch,
    activeJiraPreset,
    jiraCurrentSprint,
    jiraProjectFilter,
    jiraRefreshNonce,
    jiraActiveSavedFilterId,
    jiraSavedFilters,
    jiraSavedFiltersLoading,
    selectedJiraStatuses,
    jiraQuickFiltersLoading,
    jiraFavouriteFilter,
    setJiraStatusCatalog,
    setJiraProjectStatusOrder,
    displayedJiraIssues
  } = model
  const statusOrderOwner = useMemo(
    () =>
      ipcOrRuntimeTargetForHostId(jiraTaskSourceContext?.hostId ?? accountBackedTaskSourceHostId),
    [accountBackedTaskSourceHostId, jiraTaskSourceContext]
  )
  const statusOrderRuntimeScopeKey = getTaskPageJiraStatusOrderRuntimeScopeKey(
    jiraTaskSourceScopeKey,
    statusOrderOwner
  )
  useTaskSearchDebouncedApply(jiraSearchInput, taskResumeApplied, setAppliedJiraSearch)
  useEffect(() => {
    if (!taskResumeApplied) {
      return
    }
    if (!jiraSearchPersistReadyRef.current) {
      jiraSearchPersistReadyRef.current = true
      return
    }
    setTaskResumeState({ jiraQuery: appliedJiraSearch.trim() })
  }, [appliedJiraSearch, setTaskResumeState, taskResumeApplied, jiraSearchPersistReadyRef])
  const favourite = jiraHasWorkspace ? null : jiraFavouriteFilter
  const jiraRemoteSearch = jiraHasWorkspace ? '' : (favourite?.jql ?? appliedJiraSearch)
  const previousJiraRefreshNonceRef = useRef(jiraRefreshNonce)
  useEffect(() => {
    if (!taskResumeApplied) {
      return
    }
    if (taskSource !== 'jira') {
      return
    }
    if (!jiraConnected || jiraSavedFiltersLoading || jiraQuickFiltersLoading) {
      return
    }
    const force = previousJiraRefreshNonceRef.current !== jiraRefreshNonce
    previousJiraRefreshNonceRef.current = jiraRefreshNonce
    let cancelled = false
    let queryTooLong = false
    setJiraLoading(true)
    setJiraError(null)
    setJiraJqlRejection(null)
    setJiraErrorDetailsOpen(false)
    const trimmed = jiraRemoteSearch.trim()
    const listMeta = createJiraListMetaRecorder()
    const savedFilter = jiraSavedFilters.find((filter) => filter.id === jiraActiveSavedFilterId)
    const exactSavedJql = savedFilter?.jql === trimmed
    const searchWithinLimit = async (query: string) => {
      assertJiraFavouriteOnSite(
        favourite,
        !!jiraTaskSourceContext,
        selectedJiraSiteId,
        jiraProjectFilter
      )
      if (!isRuntimeProviderSearchQueryWithinLimit(query)) {
        queryTooLong = true
        throw new Error('Query exceeds the request limit.')
      }
      return searchJiraIssueList(query, JIRA_ISSUE_LIST_MAX, {
        sourceContext: jiraTaskSourceContext,
        ...(favourite
          ? { siteId: favourite.siteId }
          : jiraProjectFilter
            ? { siteId: jiraProjectFilter.siteId }
            : {}),
        force
      }).then((result) => listMeta.record(result, query))
    }
    const request = jiraHasWorkspace
      ? readLinkedJiraIssues(linkedJiraIssueRefs, searchJiraIssues, jiraTaskSourceContext, force)
      : trimmed.length > 0
        ? searchTaskPageJiraIssues(
            trimmed,
            async (jql) => {
              const sprintJql = jiraCurrentSprint ? withCurrentSprintClause(jql) : jql
              const query = jiraProjectFilter
                ? restrictJiraQueryToProject(sprintJql, jiraProjectFilter)
                : sprintJql
              return searchWithinLimit(query)
            },
            favourite || exactSavedJql ? 'jql' : 'input'
          ).then((result) => ({ ...result, error: null }))
        : jiraProjectFilter
          ? searchWithinLimit(
              restrictJiraQueryToProject(
                buildJiraPresetJql(activeJiraPreset, {
                  statuses: selectedJiraStatuses,
                  currentSprint: jiraCurrentSprint
                }),
                jiraProjectFilter
              )
            ).then((issues) => ({ issues, jqlRejection: null, error: null }))
          : listJiraIssueList(activeJiraPreset, JIRA_ISSUE_LIST_MAX, {
              sourceContext: jiraTaskSourceContext,
              force,
              ...(selectedJiraStatuses.length || jiraCurrentSprint
                ? {
                    filters: {
                      ...(selectedJiraStatuses.length ? { statuses: selectedJiraStatuses } : {}),
                      ...(jiraCurrentSprint ? { currentSprint: true } : {})
                    }
                  }
                : {})
            })
              .then(listMeta.record)
              .then((issues) => ({ issues, jqlRejection: null, error: null }))
    void request
      .then((result) => {
        const { issues, jqlRejection } = result
        if (cancelled) {
          return
        }
        setJiraError(result.error)
        if (!jiraHasWorkspace && !trimmed && selectedJiraStatuses.length === 0) {
          setJiraStatusCatalog({
            scopeKey: getJiraStatusCatalogScopeKey(
              jiraTaskSourceScopeKey,
              selectedJiraSiteId,
              activeJiraPreset,
              jiraProjectFilter
            ),
            items: buildJiraStatusCatalog(issues)
          })
        }
        setJiraIssues(issues)
        // Linked reads have no query, so their order means nothing.
        setJiraIssuesInQueryOrder(!jiraHasWorkspace && listMeta.inQueryOrder())
        setJiraIssueListMeta(listMeta.meta())
        setJiraJqlRejection(jqlRejection)
        setJiraLoading(false)
        const projectScope = getSingleJiraProjectScope(issues)
        if (!projectScope || !statusOrderOwner) {
          return
        }
        const statusOrderScopeKey = getTaskPageJiraStatusOrderScopeKey(
          statusOrderRuntimeScopeKey,
          projectScope
        )
        void loadTaskPageJiraProjectStatusOrder(
          statusOrderOwner,
          statusOrderRuntimeScopeKey,
          projectScope
        ).then((order) => {
          if (!cancelled) {
            setJiraProjectStatusOrder({
              order,
              scopeKey: statusOrderScopeKey
            })
          }
        })
      })
      .catch((err) => {
        if (cancelled) {
          return
        }
        const failureState = createTaskPageJiraLoadFailureState(err)
        setJiraIssues(failureState.issues)
        setJiraIssueListMeta({ truncated: false })
        setJiraError(
          queryTooLong
            ? {
                title: translate(
                  'jira.board.queryTooLong',
                  'The Jira query is too long. Shorten the query or clear filters.'
                ),
                details: null
              }
            : failureState.error
        )
        setJiraLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- linkedJiraIssueRefsSignature stands in for the refs array, which re-derives on unrelated workspace churn; store actions and setters are stable.
  }, [
    taskSource,
    jiraConnected,
    selectedJiraSiteId,
    jiraRemoteSearch,
    activeJiraPreset,
    jiraHasWorkspace,
    linkedJiraIssueRefsSignature,
    jiraCurrentSprint,
    jiraProjectFilter,
    jiraRefreshNonce,
    jiraActiveSavedFilterId,
    jiraSavedFilters,
    jiraSavedFiltersLoading,
    selectedJiraStatuses,
    jiraQuickFiltersLoading,
    favourite,
    taskResumeApplied,
    jiraTaskSourceContext,
    jiraTaskSourceScopeKey,
    statusOrderOwner,
    statusOrderRuntimeScopeKey
  ])
  useEffect(() => {
    if (!taskResumeApplied || taskSource !== 'jira') {
      return
    }
    if (!jiraConnected || displayedJiraIssues.length === 0) {
      if (selectedJiraIssueKey !== null) {
        setSelectedJiraIssueKey(null)
      }
      if (selectedJiraIssueFallback !== null) {
        setSelectedJiraIssueFallback(null)
      }
      return
    }
    if (
      selectedJiraIssueKey &&
      !displayedJiraIssues.some((issue) => issue.key === selectedJiraIssueKey)
    ) {
      setSelectedJiraIssueKey(null)
      setSelectedJiraIssueFallback(null)
    }
  }, [
    displayedJiraIssues,
    jiraConnected,
    selectedJiraIssueFallback,
    selectedJiraIssueKey,
    taskResumeApplied,
    taskSource,
    setSelectedJiraIssueFallback,
    setSelectedJiraIssueKey
  ])

  // Linear string IDs need the provider-generic numeric placeholder 0.
  return model
}
export type TaskPageJiraListEffectsModel = ReturnType<typeof useTaskPageJiraListEffects>
