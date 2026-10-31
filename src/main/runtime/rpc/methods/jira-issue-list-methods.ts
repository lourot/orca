import { ListIssues, SearchIssues } from '../../../../shared/rpc-contract/jira-params'
import { defineMethod } from '../core'

export const JIRA_ISSUE_LIST_METHODS = [
  defineMethod({
    name: 'jira.searchIssues',
    permission: 'workspace',
    params: SearchIssues,
    handler: async (params, { runtime, signal }) =>
      runtime.jiraSearchIssues(
        params.jql,
        params.limit,
        params.siteId,
        signal,
        params.strict,
        params.includeMeta
      )
  }),
  defineMethod({
    name: 'jira.listIssues',
    permission: 'workspace',
    params: ListIssues,
    handler: async (params, { runtime }) =>
      runtime.jiraListIssues(
        params?.filter,
        params?.limit,
        params?.siteId,
        params?.strict,
        params?.filters,
        params?.includeMeta
      )
  })
]
