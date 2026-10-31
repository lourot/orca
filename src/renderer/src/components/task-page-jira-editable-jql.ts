import type { JiraIssueFilter } from '../../../shared/jira-types'
import { buildJiraPresetJql } from '../../../shared/jira/jira-preset-jql'
import {
  restrictJiraQueryToProject,
  type JiraProjectReference
} from '../../../shared/jira-project-reference'

/** The JQL a preset view runs, as "Edit as JQL" exposes it. */
export function buildJiraPresetPreviewJql(args: {
  preset: JiraIssueFilter
  statuses: string[]
  currentSprint: boolean
  project: JiraProjectReference | null
}): string {
  const presetJql = buildJiraPresetJql(args.preset, {
    statuses: args.statuses,
    currentSprint: args.currentSprint
  })
  return args.project ? restrictJiraQueryToProject(presetJql, args.project) : presetJql
}

/** The query the user is looking at: the favourite, else the typed search, else the preset view. */
export function getJiraEditableJql(args: {
  favouriteJql: string | null
  searchInput: string
  preset: Parameters<typeof buildJiraPresetPreviewJql>[0]
}): string {
  return args.favouriteJql ?? (args.searchInput.trim() || buildJiraPresetPreviewJql(args.preset))
}
