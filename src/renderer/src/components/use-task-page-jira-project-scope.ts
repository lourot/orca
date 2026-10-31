import { useCallback, useState } from 'react'
import type { Repo } from '../../../shared/repo-types'
import type { JiraProjectReference } from '../../../shared/jira/jira-project-reference'
import { getRepoExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import { resolveJiraSourceHostId } from '../../../shared/jira/jira-source-host'
import { getRepoHostIdentity } from '@/store/slices/repo-host-identity'
import {
  getJiraProjectFilterScope,
  loadJiraProjectFilters,
  saveJiraProjectFilter
} from './jira-project-filter-storage'

export function useTaskPageJiraProjectScope(
  repos: readonly Repo[],
  selectedRepos: readonly Repo[],
  preselectedRepoId: string | undefined,
  hostId: ExecutionHostId,
  siteId: string | null | undefined
) {
  const preselectedRepos = preselectedRepoId
    ? repos.filter((entry) => entry.id === preselectedRepoId)
    : []
  const selectedRepo = selectedRepos.length === 1 ? selectedRepos[0] : null
  const preselectedRepo = preselectedRepos.length === 1 ? preselectedRepos[0] : null
  const repo =
    !preselectedRepoId || selectedRepo?.id === preselectedRepoId
      ? selectedRepo
      : preselectedRepos.length > 1
        ? null
        : preselectedRepo &&
            resolveJiraSourceHostId({
              workspaceHostId: getRepoExecutionHostId(preselectedRepo)
            }) === hostId
          ? preselectedRepo
          : selectedRepo
  const scopeKey = JSON.stringify([hostId, repo ? getRepoHostIdentity(repo) : null, siteId ?? null])
  const [override, setOverride] = useState<{
    scopeKey: string
    project: JiraProjectReference | null
  } | null>(null)
  const [rememberedProjects, setRememberedProjects] = useState(loadJiraProjectFilters)
  const defaultProject =
    repo && resolveJiraSourceHostId({ workspaceHostId: getRepoExecutionHostId(repo) }) === hostId
      ? (repo.defaultJiraProject ?? null)
      : null
  const applicableDefault =
    defaultProject && (!siteId || siteId === 'all' || defaultProject.siteId === siteId)
      ? defaultProject
      : null
  const rememberedScope = getJiraProjectFilterScope(hostId, siteId)
  const jiraProjectFilter =
    override?.scopeKey === scopeKey
      ? override.project
      : (applicableDefault ?? rememberedProjects[rememberedScope] ?? null)
  const hasApplicableDefault = applicableDefault !== null
  const setJiraProjectFilter = useCallback(
    (project: JiraProjectReference | null) => {
      setOverride({ scopeKey, project })
      // A repository default stays authoritative on open; only unscoped picks are remembered.
      if (!hasApplicableDefault) {
        setRememberedProjects(saveJiraProjectFilter(rememberedProjects, rememberedScope, project))
      }
    },
    [hasApplicableDefault, rememberedProjects, rememberedScope, scopeKey]
  )
  return { jiraProjectFilter, setJiraProjectFilter }
}
