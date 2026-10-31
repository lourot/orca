import { defineFixture } from '../../../component-fixtures/component-fixture'
import type { JiraIssueListMeta } from '../../../../../shared/jira/jira-issue-list-limit'
import { TaskPageJiraIssueCount } from './IssueCount'

function Header({ loaded, meta }: { loaded: number; meta: JiraIssueListMeta }) {
  return (
    <div className="flex items-center gap-2 bg-background p-3 text-2xs text-muted-foreground">
      <TaskPageJiraIssueCount shown={loaded} loaded={loaded} meta={meta} />
    </div>
  )
}

export const complete = defineFixture({
  width: 640,
  render: () => <Header loaded={230} meta={{ truncated: false }} />
})

export const truncatedWithApproximateTotal = defineFixture({
  width: 640,
  render: () => (
    <Header loaded={1000} meta={{ truncated: true, total: 2340, totalIsApproximate: true }} />
  )
})

export const truncatedWithoutTotal = defineFixture({
  width: 640,
  render: () => <Header loaded={1000} meta={{ truncated: true }} />
})
