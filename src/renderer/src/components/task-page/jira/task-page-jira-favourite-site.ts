import { translate } from '@/i18n/i18n'
import type { JiraFavouriteFilter } from '../../../../../shared/jira/jira-favourite-filters'
import type { JiraProjectReference } from '../../../../../shared/jira/jira-project-reference'

/** A Jira favourite only runs against its own site, under a project filter from that site. */
export function assertJiraFavouriteOnSite(
  favourite: JiraFavouriteFilter | null,
  hasSourceContext: boolean,
  selectedSiteId: string | null,
  projectFilter: JiraProjectReference | null
): void {
  if (
    favourite &&
    (!hasSourceContext ||
      selectedSiteId !== favourite.siteId ||
      (projectFilter && projectFilter.siteId !== favourite.siteId))
  ) {
    throw new Error(
      translate(
        'jira.favourites.siteMismatch',
        'Choose a project from the favourite’s Jira site, or clear the project filter.'
      )
    )
  }
}
