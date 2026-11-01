import { defineFixture } from '../../component-fixtures/component-fixture'
import { AutomationListLocalRow } from './AutomationListLocalRow'
import { AutomationListTableHeader } from './AutomationListTableHeader'
import { makeAutomation, makeAutomationListRow, makeStoreState } from './automations-page-fixtures'

const now = Date.UTC(2026, 10, 1, 12)
const hour = 60 * 60_000
const fixtures = makeStoreState()
const rows = [
  makeAutomation({
    id: 'uncovered',
    name: 'Nightly sweep',
    nextRunAt: now + 10 * hour,
    minMinutesSinceLastRun: 960,
    lastDispatchedAt: now - 8 * hour
  }),
  makeAutomation({
    id: 'covered',
    name: 'Already ran in window',
    nextRunAt: now + 10 * hour,
    minMinutesSinceLastRun: 960,
    lastDispatchedAt: now - 4 * hour
  }),
  makeAutomation({
    id: 'never-run',
    name: 'First scheduled run',
    nextRunAt: now + 10 * hour,
    minMinutesSinceLastRun: 960
  })
].map((automation) => makeAutomationListRow({ automation }))

export const scheduleWindow = defineFixture({
  width: 1320,
  render: () => (
    <div className="p-4">
      <AutomationListTableHeader sort={null} onSort={() => undefined} />
      {rows.map((row) => (
        <AutomationListLocalRow
          key={row.key}
          row={row}
          selectedRowKey={null}
          isSelectedLocal={true}
          lastRunByAutomationId={new Map()}
          relativeNow={now}
          repoMap={fixtures.repoMap}
          worktreeMap={fixtures.worktreeMap}
          projectHostSetups={[]}
          sshConnectionStates={new Map()}
          runtimeStatusByEnvironmentId={new Map()}
          hostTargetFor={() => null}
          automationSourceHostAvailabilityByRowKey={new Map()}
          onSelect={() => undefined}
          onRunNow={() => undefined}
          onEdit={() => undefined}
          onDuplicate={() => undefined}
          onToggle={() => undefined}
          onDelete={() => undefined}
        />
      ))}
    </div>
  ),
  interact: (frame) => {
    frame.querySelector<HTMLButtonElement>('[aria-label="Run ahead of schedule"]')?.focus()
  }
})
