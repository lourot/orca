import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { isWebClientLocation } from '@/lib/web-client-location'
import { ipcOrRuntimeTargetForHostId } from '@/runtime/runtime-client-target'
import {
  cancelRuntimeJiraJql,
  generateRuntimeJiraJql
} from '@/runtime/runtime-jira-jql-generation-client'
import {
  JIRA_JQL_GENERATION_MAX_STATUS_NAMES,
  type JiraJqlGenerationRequest
} from '../../../shared/jira/jira-jql-generation'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'
import { getJiraEditableJql } from './task-page-jira-editable-jql'
import { getJiraStatusCatalogScopeKey } from './task-page/jira/task-page-jira-status-catalog'
import type { TaskPageComposerActionsModel } from './task-page/use-task-page-composer-actions'

type JqlGenerationModel = Pick<
  TaskPageComposerActionsModel,
  | 'accountBackedTaskSourceHostId'
  | 'jiraTaskSourceContext'
  | 'jiraTaskSourceScopeKey'
  | 'selectedJiraSiteId'
  | 'jiraSites'
  | 'jiraProjectFilter'
  | 'jiraFavouriteFilter'
  | 'jiraSearchInput'
  | 'setJiraSearchInput'
  | 'setAppliedJiraSearch'
  | 'clearJiraSavedFilterSelection'
  | 'setTaskResumeState'
  | 'setJiraRefreshNonce'
  | 'activeJiraPreset'
  | 'selectedJiraStatuses'
  | 'jiraCurrentSprint'
  | 'jiraStatusCatalog'
  | 'jiraJqlRejection'
>

/** Asks the Jira connection's agent to rewrite the visible JQL, then applies the result. */
export function useTaskPageJiraJqlGeneration(model: JqlGenerationModel) {
  const {
    accountBackedTaskSourceHostId,
    jiraTaskSourceContext,
    jiraTaskSourceScopeKey,
    selectedJiraSiteId,
    jiraSites,
    jiraProjectFilter,
    jiraFavouriteFilter,
    jiraSearchInput,
    setJiraSearchInput,
    setAppliedJiraSearch,
    clearJiraSavedFilterSelection,
    setTaskResumeState,
    setJiraRefreshNonce,
    activeJiraPreset,
    selectedJiraStatuses,
    jiraCurrentSprint,
    jiraStatusCatalog,
    jiraJqlRejection
  } = model
  const ownerHostId = jiraTaskSourceContext?.hostId ?? accountBackedTaskSourceHostId
  const target = useMemo(() => ipcOrRuntimeTargetForHostId(ownerHostId), [ownerHostId])
  const siteId =
    jiraProjectFilter?.siteId ??
    jiraFavouriteFilter?.siteId ??
    (selectedJiraSiteId && selectedJiraSiteId !== 'all' ? selectedJiraSiteId : jiraSites[0]?.id)
  const available = !isWebClientLocation() && Boolean(target && siteId)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nonceRef = useRef(0)
  const searchInputRef = useRef(jiraSearchInput)
  searchInputRef.current = jiraSearchInput
  const requestRef = useRef<{
    target: RuntimeClientTarget
    args: JiraJqlGenerationRequest
    abort: AbortController
  } | null>(null)

  const cancel = useCallback((): void => {
    const request = requestRef.current
    if (!request) {
      return
    }
    requestRef.current = null
    nonceRef.current += 1
    setGenerating(false)
    request.abort.abort()
    void cancelRuntimeJiraJql(request.target, request.args).catch(() => {})
  }, [])

  // A different Jira source or site invalidates the running generation, including on unmount.
  useEffect(() => cancel, [cancel, jiraTaskSourceScopeKey, siteId, target])

  const generate = useCallback(
    async (instruction: string): Promise<boolean> => {
      const trimmed = instruction.trim()
      if (!available || !target || !siteId || !trimmed || requestRef.current) {
        return false
      }
      const catalogScopeKey = getJiraStatusCatalogScopeKey(
        jiraTaskSourceScopeKey,
        selectedJiraSiteId,
        activeJiraPreset,
        jiraProjectFilter
      )
      const statusNames =
        jiraStatusCatalog?.scopeKey === catalogScopeKey
          ? jiraStatusCatalog.items
              .slice(0, JIRA_JQL_GENERATION_MAX_STATUS_NAMES)
              .map((item) => item.name)
          : []
      const nonce = ++nonceRef.current
      const searchInputAtStart = searchInputRef.current
      const request = {
        target,
        args: {
          siteId,
          requestId: createBrowserUuid(),
          instruction: trimmed,
          baseJql: getJiraEditableJql({
            favouriteJql: jiraFavouriteFilter?.jql ?? null,
            searchInput: searchInputAtStart,
            preset: {
              preset: activeJiraPreset,
              statuses: selectedJiraStatuses,
              currentSprint: jiraCurrentSprint,
              project: jiraProjectFilter
            }
          }),
          ...(jiraProjectFilter ? { projectKey: jiraProjectFilter.key } : {}),
          ...(statusNames.length > 0 ? { statusNames } : {}),
          ...(jiraJqlRejection?.reason ? { rejectionReason: jiraJqlRejection.reason } : {})
        },
        abort: new AbortController()
      }
      requestRef.current = request
      setGenerating(true)
      setError(null)
      try {
        const result = await generateRuntimeJiraJql(
          request.target,
          request.args,
          request.abort.signal
        )
        if (nonce !== nonceRef.current) {
          return false
        }
        if (!result.success) {
          if (!result.canceled) {
            setError(
              result.error || translate('jira.jqlPrompt.failed', 'Failed to generate a JQL query.')
            )
          }
          return false
        }
        // Why: a query the user typed during generation wins over the late result.
        if (searchInputRef.current !== searchInputAtStart) {
          return false
        }
        void clearJiraSavedFilterSelection().catch(() => {})
        setJiraSearchInput(result.jql)
        setAppliedJiraSearch(result.jql)
        setTaskResumeState({ jiraQuery: result.jql })
        setJiraRefreshNonce((n) => n + 1)
        return true
      } catch (caught) {
        if (nonce === nonceRef.current) {
          setError(
            caught instanceof Error
              ? caught.message
              : translate('jira.jqlPrompt.failed', 'Failed to generate a JQL query.')
          )
        }
        return false
      } finally {
        // A late completion must not clear a newer request's progress.
        if (nonce === nonceRef.current) {
          requestRef.current = null
          setGenerating(false)
        }
      }
    },
    [
      available,
      target,
      siteId,
      jiraTaskSourceScopeKey,
      selectedJiraSiteId,
      activeJiraPreset,
      jiraProjectFilter,
      jiraStatusCatalog,
      jiraFavouriteFilter,
      selectedJiraStatuses,
      jiraCurrentSprint,
      jiraJqlRejection,
      clearJiraSavedFilterSelection,
      setJiraSearchInput,
      setAppliedJiraSearch,
      setTaskResumeState,
      setJiraRefreshNonce
    ]
  )

  return { available, generating, error, generate, cancel, clearError: () => setError(null) }
}
