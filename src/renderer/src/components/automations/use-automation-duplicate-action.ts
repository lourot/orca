import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { isSameAutomationOwner, ownerKey } from '../../../../shared/automation-owner-key'
import { automationActionAvailability, capturedAutomationOwner } from './automation-captured-owner'
import { automationCreateHostEligible } from './automation-create-destination'
import {
  duplicateOwnedAutomation,
  type AutomationDuplicateOperation
} from './automation-owner-action-runner'
import { toDispatchResult } from './automation-row-action-dispatch'
import type { AutomationListRow } from './automation-list-row-identity'
import type { AutomationsPageActionContext } from './automations-page-action-context'

/** Duplicate on the captured host, keeping retries and rapid clicks in one operation. */
export function useAutomationDuplicateAction({
  destination,
  pageRefresh
}: Pick<AutomationsPageActionContext, 'destination' | 'pageRefresh'>) {
  const operations = useRef(new Map<string, AutomationDuplicateOperation>())
  const inFlight = useRef(new Set<string>())
  const [pendingRowKeys, setPendingRowKeys] = useState<ReadonlySet<string>>(() => new Set())

  const availabilityFor = (row: AutomationListRow) =>
    automationActionAvailability(
      capturedAutomationOwner(destination.automationDispatchContext.capturedOwners, row.key),
      'duplicate'
    )

  const isEnabled = (row: AutomationListRow): boolean => {
    const availability = availabilityFor(row)
    const host = destination.rowRecoveryHost(row.key)
    return (
      !pendingRowKeys.has(row.key) &&
      availability.kind === 'owned' &&
      host !== null &&
      automationCreateHostEligible(host) &&
      isSameAutomationOwner(host.owner, availability.owner) &&
      host.authorityHealth !== 'unavailable' &&
      host.authorityHealth !== 'incompatible' &&
      host.authorityHealth !== 'loading'
    )
  }

  const duplicateAutomation = async (row: AutomationListRow): Promise<void> => {
    if (inFlight.current.has(row.key) || !isEnabled(row)) {
      return
    }
    const availability = availabilityFor(row)
    if (availability.kind !== 'owned') {
      return
    }
    const key = `${ownerKey(availability.owner)}:${row.automation.id}`
    const operation = operations.current.get(key) ?? {}
    operations.current.set(key, operation)
    inFlight.current.add(row.key)
    setPendingRowKeys(new Set(inFlight.current))
    try {
      const outcome = await duplicateOwnedAutomation(availability, row.automation.id, operation)
      if (outcome.status === 'uncaptured') {
        return
      }
      const result = toDispatchResult(outcome)
      destination.reportOwnerAction(row.key, result.ok ? null : result.notice)
      if (result.ok) {
        operations.current.delete(key)
        destination.invalidateWrittenHost(
          { authority: availability.owner.authority, selector: availability.owner.selector },
          'definition'
        )
        toast.success(
          translate('automations.duplicate.created', 'Created {{name}}', {
            name: result.value.name
          })
        )
        await pageRefresh.refresh()
      }
    } finally {
      inFlight.current.delete(row.key)
      setPendingRowKeys(new Set(inFlight.current))
    }
  }

  return { duplicateAutomation, isEnabled }
}
