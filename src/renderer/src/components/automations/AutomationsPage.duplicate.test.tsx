// @vitest-environment happy-dom

import { act } from 'react'
import { describe, expect, it } from 'vitest'
import type { Automation } from '../../../../shared/automations-types'
import {
  api,
  installAutomationsPageHarness,
  mocks,
  renderPage,
  runtimeHost,
  scopedList,
  settleHostQueries
} from './automations-page-test-harness'
import { listedRows } from './automations-page-listed-items'
import { makeAutomation } from './automations-page-fixtures'

describe('AutomationsPage duplication', () => {
  installAutomationsPageHarness()

  it('duplicates the desktop row despite a colliding runtime id without opening the editor', async () => {
    runtimeHost([makeAutomation({ name: 'Remote nightly' })], [])
    const source = makeAutomation({ name: 'Desktop nightly', enabled: false })
    scopedList([source])
    const copy = makeAutomation({ id: 'copy', name: 'Desktop nightly (copy)', enabled: false })
    api.automations.create.mockResolvedValue(copy)
    await renderPage()
    await settleHostQueries()
    const row = listedRows().find((candidate) => candidate.automation.name === source.name)
    expect(row).toBeDefined()
    if (!row) {
      throw new Error('Desktop row missing')
    }
    const selection = mocks.listPanel?.selectedRowKey
    await act(async () => {
      mocks.listPanel?.duplicateAutomation(row)
    })
    expect(api.automations.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        name: copy.name,
        enabled: false,
        destination: { selector: { kind: 'self' } }
      })
    )
    expect(
      mocks.callRuntimeRpc.mock.calls.filter((call) => {
        const target: unknown = call[0]
        return (
          typeof target === 'object' &&
          target !== null &&
          'kind' in target &&
          target.kind === 'environment' &&
          call[1] === 'automation.create'
        )
      })
    ).toEqual([])
    expect(mocks.editorDialog?.open).toBe(false)
    expect(mocks.listPanel?.selectedRowKey).toBe(selection)
    expect(mocks.toastSuccess).toHaveBeenCalledWith(`Created ${copy.name}`)
  })

  it('blocks rapid clicks and enables a separate copy after the first create completes', async () => {
    await renderPage()
    await settleHostQueries()
    const row = listedRows()[0]
    if (!row) {
      throw new Error('Source row missing')
    }
    let finish: (automation: Automation) => void = () => {
      throw new Error('Create not started')
    }
    api.automations.create.mockImplementationOnce(
      () =>
        new Promise<Automation>((resolve) => {
          finish = resolve
        })
    )
    await act(async () => {
      mocks.listPanel?.duplicateAutomation(row)
      mocks.listPanel?.duplicateAutomation(row)
    })
    expect(api.automations.create).toHaveBeenCalledTimes(1)
    expect(mocks.listPanel?.isActionEnabled(row, 'duplicate')).toBe(false)
    const copy = makeAutomation({ id: 'copy', name: 'Nightly (copy)' })
    scopedList([row.automation, copy])
    await act(async () => {
      finish(copy)
    })
    expect(mocks.listPanel?.isActionEnabled(row, 'duplicate')).toBe(true)
    await act(async () => {
      mocks.listPanel?.duplicateAutomation(row)
    })
    expect(api.automations.create).toHaveBeenCalledTimes(2)
    expect(api.automations.create.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ name: 'Nightly (copy 2)' })
    )
    expect(api.automations.create.mock.calls[0]?.[0].creationKey).not.toBe(
      api.automations.create.mock.calls[1]?.[0].creationKey
    )
  })

  it('copies corrected source settings after reopening the page following a rejection', async () => {
    const page = await renderPage()
    await settleHostQueries()
    const row = listedRows()[0]
    if (!row) {
      throw new Error('Source row missing')
    }
    api.automations.create.mockRejectedValueOnce(new Error('Invalid saved settings'))
    await act(async () => {
      mocks.listPanel?.duplicateAutomation(row)
    })
    expect(api.automations.create).toHaveBeenCalledTimes(1)
    const firstKey: unknown = api.automations.create.mock.calls[0]?.[0].creationKey
    await page.unmount()
    scopedList([makeAutomation({ prompt: 'Corrected settings' })])
    await renderPage()
    await settleHostQueries()
    const corrected = listedRows()[0]
    if (!corrected) {
      throw new Error('Corrected source row missing')
    }
    await act(async () => {
      mocks.listPanel?.duplicateAutomation(corrected)
    })
    expect(api.automations.create.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ prompt: 'Corrected settings' })
    )
    expect(api.automations.create.mock.calls[1]?.[0].creationKey).not.toBe(firstKey)
  })
})
