import { translate } from '@/i18n/i18n'
import { uiNumberFormat } from '@/i18n/ui-intl-formatters'
import type { JiraIssueListMeta } from '../../../../../shared/jira/jira-issue-list-limit'

const COUNT_FORMAT: Intl.NumberFormatOptions = { useGrouping: true }

function truncationNotice(loaded: number, meta: JiraIssueListMeta): string {
  const shown = uiNumberFormat(COUNT_FORMAT).format(loaded)
  if (meta.total === undefined) {
    return translate(
      'jira.issueList.truncated',
      'Only the first {{shown}} loaded. Narrow the query to see the rest.',
      { shown }
    )
  }
  const total = uiNumberFormat(COUNT_FORMAT).format(meta.total)
  return meta.totalIsApproximate
    ? translate(
        'jira.issueList.truncatedOfApproximateTotal',
        'Only the first {{shown}} of about {{total}} loaded. Narrow the query to see the rest.',
        { shown, total }
      )
    : translate(
        'jira.issueList.truncatedOfTotal',
        'Only the first {{shown}} of {{total}} loaded. Narrow the query to see the rest.',
        { shown, total }
      )
}

/** The "N shown" count, plus a notice when Jira matched more issues than were loaded. */
export function TaskPageJiraIssueCount({
  shown,
  loaded,
  meta
}: {
  shown: number
  loaded: number
  meta: JiraIssueListMeta
}) {
  return (
    <>
      <span>
        {translate('auto.components.TaskPage.shownCount', '{{count}} shown', {
          count: shown,
          defaultValue_one: '{{count}} shown'
        })}
      </span>
      {meta.truncated ? <span>{truncationNotice(loaded, meta)}</span> : null}
    </>
  )
}
