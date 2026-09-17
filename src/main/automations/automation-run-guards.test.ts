/**
 * The two scheduler-decided reasons an occurrence is skipped: the automation ran too
 * recently, and a previous run has not finished. Both replace a precheck command that
 * silently skipped every run for a day, so what is under test is mostly the ways a guard
 * can wedge a schedule rather than the happy path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Repo } from '../../shared/repo-types'
import type { Automation, AutomationCreateInput } from '../../shared/automations-types'
import type { Store } from '../persistence'
import { AutomationService } from './service'
import { installFakeAppEnvironment } from '../../../config/scripts/vitest-host-ports-setup'

const testState = { dir: '' }

vi.mock('electron', () => ({
  app: {
    getPath: () => testState.dir
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext: string) => Buffer.from(`encrypted:${plaintext}`, 'utf-8'),
    decryptString: (ciphertext: Buffer) => ciphertext.toString('utf-8').slice('encrypted:'.length)
  }
}))

async function createStore(): Promise<Store> {
  vi.resetModules()
  installFakeAppEnvironment({ getPath: () => testState.dir })
  const { Store: StoreClass, initDataPath } = await import('../persistence')
  initDataPath()
  return new StoreClass()
}

const makeRepo = (): Repo => ({
  id: 'r1',
  path: '/repo',
  displayName: 'test',
  badgeColor: '#fff',
  addedAt: 1
})

const at = (iso: string): number => new Date(iso).getTime()

/** Hourly on the hour, so occurrence times are timezone-independent, against a workspace
 *  the target resolver accepts — otherwise every run would refuse before reaching a guard. */
async function seedAutomation(overrides: Partial<AutomationCreateInput> = {}): Promise<{
  store: Store
  automation: Automation
}> {
  const store = await createStore()
  store.addRepo(makeRepo())
  const automation = store.createAutomation({
    name: 'Guarded',
    prompt: 'Run it',
    agentId: 'claude',
    projectId: 'r1',
    workspaceMode: 'existing',
    workspaceId: 'r1::wt1',
    timezone: 'UTC',
    rrule: '0 * * * *',
    dtstart: at('2026-05-12T00:00:00Z'),
    skipWhileRunActive: false,
    ...overrides
  })
  return { store, automation }
}

function attachedService(store: Store): AutomationService {
  const service = new AutomationService(store, { tickMs: 60_000 })
  service.setWebContents({ isDestroyed: () => false, send: vi.fn() } as never)
  return service
}

/** Exactly one evaluation pass at `when` -- setRendererReady() triggers it directly, so
 *  advancing the timer instead would silently add a second pass a minute later. */
async function passAt(service: AutomationService, when: string): Promise<void> {
  vi.setSystemTime(new Date(when))
  service.setRendererReady()
  await vi.advanceTimersByTimeAsync(0)
}

const nextRunAt = (store: Store, automationId: string): number =>
  store.listAutomations().find((entry) => entry.id === automationId)?.nextRunAt ?? 0

const newestRun = (store: Store, automationId: string) => store.listAutomationRuns(automationId)[0]

/** What a real executor reports back. Only `dispatched` moves the cooldown clock, which is
 *  the whole reason the clock is not `lastRunAt`. */
function reportRunStatus(
  store: Store,
  automationId: string,
  status: 'dispatched' | 'completed' | 'skipped_unavailable'
): void {
  store.updateAutomationRun({
    runId: newestRun(store, automationId).id,
    status,
    workspaceId: 'r1::wt1',
    error: null
  })
}

/** Dispatch one occurrence and let it finish, leaving only `lastDispatchedAt` behind. */
async function runOnce(
  store: Store,
  service: AutomationService,
  automation: Automation,
  when: string
): Promise<void> {
  await passAt(service, when)
  reportRunStatus(store, automation.id, 'dispatched')
  reportRunStatus(store, automation.id, 'completed')
}

describe('automation run guards', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-run-guards-test-'))
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-13T08:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('skips an occurrence inside the cooldown window', async () => {
    const { store, automation } = await seedAutomation({ minMinutesSinceLastRun: 180 })
    const service = attachedService(store)

    await runOnce(store, service, automation, '2026-05-13T09:01:00Z')
    await passAt(service, '2026-05-13T10:01:00Z')

    expect(newestRun(store, automation.id).status).toBe('skipped_cooldown')
  })

  it('dispatches an occurrence past the cooldown window', async () => {
    const { store, automation } = await seedAutomation({ minMinutesSinceLastRun: 180 })
    const service = attachedService(store)

    await runOnce(store, service, automation, '2026-05-13T09:01:00Z')
    await passAt(service, '2026-05-13T12:01:00Z')

    expect(newestRun(store, automation.id).status).toBe('dispatching')
  })

  // The bug this whole feature replaces: the previous precheck-based cooldown reset its own
  // clock on every skip, so after the first skip the automation never ran again.
  it('does not let a cooldown skip extend the cooldown', async () => {
    const { store, automation } = await seedAutomation({ minMinutesSinceLastRun: 180 })
    const service = attachedService(store)

    await runOnce(store, service, automation, '2026-05-13T09:01:00Z')
    await passAt(service, '2026-05-13T10:01:00Z')
    await passAt(service, '2026-05-13T11:01:00Z')
    await passAt(service, '2026-05-13T12:01:00Z')

    expect(newestRun(store, automation.id).status).toBe('dispatching')
  })

  // Same clock confusion from the other side: a skip stamps `lastRunAt`, so a cooldown
  // reading that field would start counting from a run that never launched an agent.
  it('does not start a cooldown from a run that never dispatched', async () => {
    const { store, automation } = await seedAutomation({ minMinutesSinceLastRun: 180 })
    const service = attachedService(store)

    await passAt(service, '2026-05-13T09:01:00Z')
    reportRunStatus(store, automation.id, 'skipped_unavailable')
    await passAt(service, '2026-05-13T10:01:00Z')

    expect(newestRun(store, automation.id).status).toBe('dispatching')
  })

  it('runs a manual request while the cooldown is in force', async () => {
    const { store, automation } = await seedAutomation({ minMinutesSinceLastRun: 180 })
    const service = attachedService(store)

    await runOnce(store, service, automation, '2026-05-13T09:01:00Z')
    vi.setSystemTime(new Date('2026-05-13T10:01:00Z'))
    const run = await service.runNow(automation.id)

    expect(run.status).toBe('dispatching')
  })

  it('folds repeated cooldown skips into one record', async () => {
    const { store, automation } = await seedAutomation({ minMinutesSinceLastRun: 300 })
    const service = attachedService(store)

    await runOnce(store, service, automation, '2026-05-13T09:01:00Z')
    await passAt(service, '2026-05-13T10:01:00Z')
    await passAt(service, '2026-05-13T11:01:00Z')
    await passAt(service, '2026-05-13T12:01:00Z')

    const skips = store
      .listAutomationRuns(automation.id)
      .filter((run) => run.status === 'skipped_cooldown')
    expect(skips).toHaveLength(1)
    expect(skips[0].occurrenceCount).toBe(3)
  })

  it('skips an occurrence while a previous run is still active', async () => {
    const { store, automation } = await seedAutomation({ skipWhileRunActive: true })
    const service = attachedService(store)

    await passAt(service, '2026-05-13T09:01:00Z')
    reportRunStatus(store, automation.id, 'dispatched')
    await passAt(service, '2026-05-13T10:01:00Z')

    expect(newestRun(store, automation.id).status).toBe('skipped_run_active')
  })

  it('starts an overlapping occurrence when the guard is opted out', async () => {
    const { store, automation } = await seedAutomation({ skipWhileRunActive: false })
    const service = attachedService(store)

    await passAt(service, '2026-05-13T09:01:00Z')
    reportRunStatus(store, automation.id, 'dispatched')
    await passAt(service, '2026-05-13T10:01:00Z')

    expect(newestRun(store, automation.id).status).toBe('dispatching')
  })

  // The guard defaults on, so an unbounded version turns one stalled dispatch -- or any
  // crashed-session row an existing store already holds -- into a dead automation.
  it.each([
    ['a dispatch that never reported back', 'dispatched' as const, '2026-05-14T10:01:00Z'],
    ['a row an executor never picked up', null, '2026-05-13T09:04:00Z']
  ])('stops blocking on %s', async (_label, reported, when) => {
    const { store, automation } = await seedAutomation({ skipWhileRunActive: true })
    const service = attachedService(store)

    await passAt(service, '2026-05-13T09:01:00Z')
    if (reported) {
      reportRunStatus(store, automation.id, reported)
    }
    await passAt(service, when)

    expect(newestRun(store, automation.id).status).toBe('dispatching')
  })

  it('refuses a manual request while a previous run is still active', async () => {
    const { store, automation } = await seedAutomation({ skipWhileRunActive: true })
    const service = attachedService(store)

    await passAt(service, '2026-05-13T09:01:00Z')
    reportRunStatus(store, automation.id, 'dispatched')
    vi.setSystemTime(new Date('2026-05-13T10:01:00Z'))
    const run = await service.runNow(automation.id)

    expect(run).toMatchObject({ status: 'skipped_run_active', trigger: 'manual' })
  })

  // Without this the tick re-evaluates the same occurrence every 60s forever, which is the
  // silent signature the original incident had.
  it.each([
    ['cooldown', { minMinutesSinceLastRun: 180 }, true, 'skipped_cooldown'],
    ['an active run', { skipWhileRunActive: true }, false, 'skipped_run_active']
  ])(
    'advances nextRunAt past an occurrence skipped for %s',
    async (_label, overrides, finish, skipStatus) => {
      const { store, automation } = await seedAutomation(overrides)
      const service = attachedService(store)

      await passAt(service, '2026-05-13T09:01:00Z')
      reportRunStatus(store, automation.id, 'dispatched')
      if (finish) {
        reportRunStatus(store, automation.id, 'completed')
      }
      const beforeSkip = nextRunAt(store, automation.id)
      await passAt(service, '2026-05-13T10:01:00Z')

      expect(newestRun(store, automation.id).status).toBe(skipStatus)
      expect(nextRunAt(store, automation.id)).toBeGreaterThan(beforeSkip)
    }
  )
})
