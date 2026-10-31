import {
  normalizeJiraProjectReference,
  type JiraProjectReference
} from '../../../shared/jira/jira-project-reference'

// Device-local, like the Jira view mode, rather than synced through ui.set.
const STORAGE_KEY = 'orca.jira.project-filter.v1'

export type JiraProjectFilters = Readonly<Record<string, JiraProjectReference>>

/** Scope of a remembered pick: one execution host and one Jira site selection ('all' included). */
export function getJiraProjectFilterScope(
  hostId: string,
  siteId: string | null | undefined
): string {
  // NUL keeps the key collision-free without escaping host or site ids.
  return `${hostId}\0${siteId ?? ''}`
}

/** Remembered project picks by scope; invalid entries are dropped. */
export function loadJiraProjectFilters(): JiraProjectFilters {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    const filters: Record<string, JiraProjectReference> = {}
    for (const [scope, value] of Object.entries(parsed)) {
      const project = normalizeJiraProjectReference(value)
      if (project) {
        filters[scope] = project
      }
    }
    return filters
  } catch {
    return {}
  }
}

/** Stores the pick for one scope and returns the new map; null ("All projects") removes the entry. */
export function saveJiraProjectFilter(
  filters: JiraProjectFilters,
  scope: string,
  project: JiraProjectReference | null
): JiraProjectFilters {
  const { [scope]: _previous, ...rest } = filters
  const next = project ? { ...rest, [scope]: project } : rest
  try {
    if (Object.keys(next).length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // The live pick stays usable when browser storage is unavailable or full.
  }
  return next
}
