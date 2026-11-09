import { useAppStore } from '@/store'
import type { JiraKeyLinkConfig } from '../../../shared/jira/jira-key-text-links'

function activeConfig(config: JiraKeyLinkConfig | undefined): JiraKeyLinkConfig | null {
  return config?.baseUrl && config.projectKeys.length > 0 ? config : null
}

/** Reads the Jira key link config at call time, for providers registered once outside React. */
export function getJiraKeyLinkConfig(): JiraKeyLinkConfig | null {
  return activeConfig(useAppStore.getState().settings?.jiraKeyLinks)
}

/** The Jira key link config; the settings object is replaced on every write, so identity tracks changes. */
export function useJiraKeyLinkConfig(): JiraKeyLinkConfig | null {
  return activeConfig(useAppStore((state) => state.settings?.jiraKeyLinks))
}
