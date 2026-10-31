import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { JiraIssue, JiraIssueLink } from '../../../shared/jira/jira-types'
import { getJiraStatusTone } from './task-page/jira/task-page-jira-status-tone'
import { TaskTypeIcon } from './task-page/task-type-icon'

// Blocking relations first; other link phrases keep Jira's order.
const RELATION_ORDER = ['is blocked by', 'blocks']

/** Groups the issue's parent, sub-tasks and links, in the order the section shows them. */
export function groupJiraIssueLinks(issue: JiraIssue): { label: string; links: JiraIssueLink[] }[] {
  const groups: { label: string; links: JiraIssueLink[] }[] = []
  if (issue.parent) {
    groups.push({
      label: translate('jira.linkedIssues.parent', 'Parent'),
      links: [
        {
          relation: 'parent',
          key: issue.parent.key,
          title: issue.parent.title,
          statusName: '',
          statusCategoryKey: '',
          issueTypeName: issue.parent.issueTypeName
        }
      ]
    })
  }
  if (issue.subtasks?.length) {
    groups.push({
      label: translate('jira.linkedIssues.subtasks', 'Sub-tasks'),
      links: issue.subtasks
    })
  }
  const byRelation = new Map<string, JiraIssueLink[]>()
  for (const link of issue.links ?? []) {
    byRelation.set(link.relation, [...(byRelation.get(link.relation) ?? []), link])
  }
  const rank = (relation: string): number => {
    const index = RELATION_ORDER.indexOf(relation.toLowerCase())
    return index === -1 ? RELATION_ORDER.length : index
  }
  const relations = [...byRelation.keys()].sort((a, b) => rank(a) - rank(b))
  return [
    ...groups,
    ...relations.map((relation) => ({ label: relation, links: byRelation.get(relation) ?? [] }))
  ]
}

/** The drawer's "Linked issues" section; each entry opens that issue. Nothing when there are none. */
export function JiraIssueLinkedIssues({
  issue,
  onOpenIssueKey
}: {
  issue: JiraIssue
  onOpenIssueKey?: (key: string, siteId: string | undefined) => void
}): React.JSX.Element | null {
  const groups = groupJiraIssueLinks(issue)
  if (!groups.length) {
    return null
  }
  return (
    <section className="border-b border-border/40 px-4 py-4">
      <h3 className="mb-2 text-xs font-medium text-foreground">
        {translate('jira.linkedIssues.title', 'Linked issues')}
      </h3>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1">
        {groups.map(({ label, links }) => (
          <div key={label} className="contents">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="flex min-w-0 flex-col items-start">
              {links.map((link) => (
                <Button
                  key={link.key}
                  variant="ghost"
                  size="xs"
                  className="max-w-full justify-start"
                  disabled={!onOpenIssueKey}
                  onClick={() => onOpenIssueKey?.(link.key, issue.siteId)}
                >
                  <TaskTypeIcon type={link.issueTypeName} />
                  <span className="font-mono">{link.key}</span>
                  <span className="truncate">{link.title}</span>
                  {link.statusName ? (
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium',
                        getJiraStatusTone(link.statusCategoryKey)
                      )}
                    >
                      {link.statusName}
                    </span>
                  ) : null}
                </Button>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
