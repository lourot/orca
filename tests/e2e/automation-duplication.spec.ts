import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

test('duplicates from the list with independent saved settings and empty history', async ({
  orcaPage
}) => {
  await waitForSessionReady(orcaPage)
  const config = {
    name: 'Synthetic duplication check',
    prompt: 'Check <synthetic> input\nKeep this second line.',
    agentId: 'codex',
    extraAgentArgs: '--model gpt-5',
    precheck: { command: 'echo synthetic', timeoutSeconds: 37 },
    workspaceMode: 'new_per_run',
    baseBranch: 'main',
    setupDecision: 'skip',
    reuseSession: false,
    timezone: 'Pacific/Auckland',
    rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;BYHOUR=17;BYMINUTE=23',
    dtstart: 1_700_000_000_000,
    enabled: false,
    missedRunGraceMinutes: 19,
    minMinutesSinceLastRun: 43,
    skipWhileRunActive: false
  }
  await orcaPage.evaluate(async (config) => {
    const store = window.__store
    const repo = store?.getState().repos[0]
    if (!store || !repo) {
      throw new Error('Seeded repo missing')
    }
    const response = await window.api.runtime.call({
      method: 'automation.create',
      params: { ...config, repo: `id:${repo.id}` }
    })
    if (!response.ok) {
      throw new Error(response.error.message)
    }
    store.getState().openAutomationsPage()
  }, config)

  const row = orcaPage.locator('[data-automation-row-id]').filter({
    has: orcaPage.getByText(config.name, { exact: true })
  })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Automation actions' }).click()
  await orcaPage.getByRole('menuitem', { name: 'Duplicate', exact: true }).click()
  const copyName = `${config.name} (copy)`
  const copyRow = orcaPage.locator('[data-automation-row-id]').filter({
    has: orcaPage.getByText(copyName, { exact: true })
  })
  await expect(copyRow).toBeVisible()
  await expect(orcaPage.getByRole('dialog')).toHaveCount(0)

  const saved = await orcaPage.evaluate(
    async ({ name, copyName }) => {
      const response = await window.api.runtime.call({ method: 'automation.list', params: {} })
      if (!response.ok) {
        throw new Error(response.error.message)
      }
      const result = response.result
      if (
        typeof result !== 'object' ||
        result === null ||
        !('automations' in result) ||
        !Array.isArray(result.automations)
      ) {
        throw new Error('Unreadable automation list')
      }
      const records = result.automations.filter(
        (value: unknown): value is Record<string, unknown> =>
          typeof value === 'object' &&
          value !== null &&
          'id' in value &&
          typeof value.id === 'string'
      )
      const original = records.find((entry) => entry.name === name)
      const copy = records.find((entry) => entry.name === copyName)
      if (!original || !copy || typeof copy.id !== 'string') {
        throw new Error('Saved copy missing')
      }
      const runs = await window.api.runtime.call({
        method: 'automation.runs',
        params: { automationId: copy.id }
      })
      if (!runs.ok) {
        throw new Error(runs.error.message)
      }
      const updated = await window.api.runtime.call({
        method: 'automation.update',
        params: { id: copy.id, updates: { name: 'Independent copy' } }
      })
      if (!updated.ok) {
        throw new Error(updated.error.message)
      }
      return { original, copy, runs: runs.result }
    },
    { name: config.name, copyName }
  )

  expect(saved.original).toMatchObject(config)
  expect(saved.copy).toMatchObject({
    ...config,
    name: copyName,
    id: expect.not.stringMatching(String(saved.original.id)),
    creationKey: expect.any(String),
    createdAt: expect.any(Number),
    updatedAt: expect.any(Number)
  })
  expect(saved.copy.lastRunAt).toBeUndefined()
  expect(saved.copy.lastDispatchedAt).toBeUndefined()
  expect(saved.copy.nextRunAt).toBeGreaterThan(Date.now())
  expect(saved.runs).toMatchObject({ runs: [] })
  await expect(row).toBeVisible()
  await expect(orcaPage.getByText('Independent copy', { exact: true })).toBeVisible()
})
