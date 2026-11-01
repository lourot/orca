// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Automation } from '../../../../shared/automations-types'
import { AutomationListLocalRow, type AutomationListLocalRowProps } from './AutomationListLocalRow'
import { makeAutomation, makeAutomationListRow, makeStoreState } from './automations-page-fixtures'

const NOW = Date.UTC(2026, 10, 1, 12)
const HOUR = 60 * 60_000
const LABEL = 'Run ahead of schedule'
const ELIGIBLE = makeAutomation({
  nextRunAt: NOW + 10 * HOUR,
  minMinutesSinceLastRun: 16 * 60,
  lastDispatchedAt: NOW - 8 * HOUR
})

/** Render the real row so nested button activation also exercises row selection and availability. */
function renderRow(automation = ELIGIBLE, overrides: Partial<AutomationListLocalRowProps> = {}) {
  const fixtures = makeStoreState()
  const props: AutomationListLocalRowProps = {
    row: makeAutomationListRow({ automation }),
    selectedRowKey: null,
    isSelectedLocal: true,
    lastRunByAutomationId: new Map(),
    relativeNow: NOW,
    repoMap: fixtures.repoMap,
    worktreeMap: fixtures.worktreeMap,
    projectHostSetups: [],
    sshConnectionStates: new Map(),
    runtimeStatusByEnvironmentId: new Map(),
    hostTargetFor: () => null,
    automationSourceHostAvailabilityByRowKey: new Map(),
    onSelect: vi.fn(),
    onRunNow: vi.fn(),
    onEdit: vi.fn(),
    onDuplicate: vi.fn(),
    onToggle: vi.fn(),
    onDelete: vi.fn(),
    ...overrides
  }
  const view = (current: Automation, now = NOW) => (
    <TooltipProvider>
      <AutomationListLocalRow
        {...props}
        row={{ ...props.row, automation: current }}
        relativeNow={now}
      />
    </TooltipProvider>
  )
  const result = render(view(automation))
  return {
    ...result,
    props,
    refresh: (current: Automation, now = NOW) => result.rerender(view(current, now))
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Automation run ahead', () => {
  const cases: [string, Partial<Automation>, boolean][] = [
    ['uncovered next occurrence', {}, true],
    ['already covered next occurrence', { lastDispatchedAt: NOW - 4 * HOUR }, false],
    ['last dispatch exactly at boundary', { lastDispatchedAt: NOW - 6 * HOUR }, false],
    ['last dispatch just outside boundary', { lastDispatchedAt: NOW - 6 * HOUR - 1 }, true],
    ['last dispatch just inside boundary', { lastDispatchedAt: NOW - 6 * HOUR + 1 }, false],
    ['now exactly at boundary', { nextRunAt: NOW + 16 * HOUR }, false],
    ['now just inside boundary', { nextRunAt: NOW + 16 * HOUR - 1 }, true],
    ['now outside window', { nextRunAt: NOW + 20 * HOUR }, false],
    ['due now', { nextRunAt: NOW }, false],
    ['past due', { nextRunAt: NOW - 1 }, false],
    ['cooldown off', { minMinutesSinceLastRun: 0 }, false],
    ['paused', { enabled: false }, false],
    ['recent skip after older dispatch', { lastRunAt: NOW - HOUR }, true],
    ['invalid next-run timestamp', { nextRunAt: Number.NaN }, false]
  ]

  it.each(cases)('shows correct eligibility for %s', (_name, overrides, visible) => {
    renderRow({ ...ELIGIBLE, ...overrides })
    expect(screen.queryByRole('button', { name: LABEL }) !== null).toBe(visible)
  })

  it('offers an undispatched automation but hides an absent cooldown', () => {
    const neverRun = makeAutomation({ nextRunAt: NOW + 10 * HOUR, minMinutesSinceLastRun: 960 })
    const { refresh } = renderRow(neverRun)
    expect(screen.getByRole('button', { name: LABEL })).toBeTruthy()
    refresh(makeAutomation({ nextRunAt: neverRun.nextRunAt }))
    expect(screen.queryByRole('button', { name: LABEL })).toBeNull()
  })

  it.each(['mouse', 'Enter', 'Space'])(
    'runs the row with %s without opening detail',
    async (key) => {
      const { props } = renderRow()
      const user = userEvent.setup()
      const button = screen.getByRole('button', { name: LABEL })
      if (key === 'mouse') {
        await user.click(button)
      } else {
        button.focus()
        await user.keyboard(key === 'Enter' ? '{Enter}' : ' ')
      }
      expect(props.onRunNow).toHaveBeenCalledExactlyOnceWith(props.row)
      expect(props.onSelect).not.toHaveBeenCalled()
    }
  )

  it.each(['target', 'owner'])('disables run ahead when %s is unavailable', async (reason) => {
    const { props } = renderRow(
      ELIGIBLE,
      reason === 'target' ? { repoMap: new Map() } : { isActionEnabled: () => false }
    )
    const button = screen.getByRole('button', { name: LABEL })
    expect(button.hasAttribute('disabled')).toBe(true)
    // Disabled buttons pass pointer hits through to their parent.
    const hitTarget = button.parentElement
    if (!hitTarget) {
      throw new Error('Button has no hit target')
    }
    await userEvent.setup().click(hitTarget)
    expect(props.onRunNow).not.toHaveBeenCalled()
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('blocks repeated clicks until the request settles, then restores the button', async () => {
    const request = Promise.withResolvers<void>()
    const onRunNow = vi.fn(() => request.promise)
    renderRow(ELIGIBLE, { onRunNow })
    const user = userEvent.setup()
    const button = screen.getByRole('button', { name: LABEL })
    await user.click(button)
    expect(button.hasAttribute('disabled')).toBe(true)
    await user.click(button)
    expect(onRunNow).toHaveBeenCalledTimes(1)
    await act(async () => request.resolve())
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
  })

  it('reports rejected requests and restores the button', async () => {
    const errorToast = vi.spyOn(toast, 'error')
    renderRow(ELIGIBLE, { onRunNow: vi.fn().mockRejectedValue(new Error('Host disconnected')) })
    const button = screen.getByRole('button', { name: LABEL })
    await userEvent.setup().click(button)
    expect(errorToast).toHaveBeenCalledWith('Host disconnected')
    expect(button.hasAttribute('disabled')).toBe(false)
  })

  it('appears as time enters the window and disappears after an actual dispatch', () => {
    const { refresh } = renderRow(ELIGIBLE, { relativeNow: NOW })
    refresh(ELIGIBLE, NOW - 7 * HOUR)
    expect(screen.queryByRole('button', { name: LABEL })).toBeNull()
    refresh(ELIGIBLE)
    expect(screen.getByRole('button', { name: LABEL })).toBeTruthy()
    refresh({ ...ELIGIBLE, lastDispatchedAt: NOW })
    expect(screen.queryByRole('button', { name: LABEL })).toBeNull()
  })
})
