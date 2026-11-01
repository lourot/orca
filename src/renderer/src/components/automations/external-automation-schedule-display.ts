import type {
  ExternalAutomationJob,
  ExternalAutomationManager
} from '../../../../shared/automations-types'
import { isRunnableAutomationCronSchedule } from '../../../../shared/automation-schedule-parsing'
import {
  formatUiAutomationSchedule,
  formatUiAutomationScheduleTitle
} from './automation-schedule-label'
import { translate } from '@/i18n/i18n'

export type ExternalAutomationScheduleDisplay = {
  label: string
  title?: string
}

function getDisplayableProviderSchedule(schedule: string): string | null {
  const trimmed = schedule.trim()
  const cronMatch = /^cron\s+(.+?)(?:\s+@\s+.+)?$/i.exec(trimmed)
  return cronMatch?.[1]?.trim() ?? trimmed
}

export function getExternalAutomationScheduleDisplay(
  _manager: ExternalAutomationManager,
  job: ExternalAutomationJob
): ExternalAutomationScheduleDisplay {
  const providerSchedule = job.schedule.trim()
  const candidateSchedules = [
    job.rawSchedule?.trim(),
    getDisplayableProviderSchedule(providerSchedule)
  ]

  for (const candidate of candidateSchedules) {
    if (candidate && isRunnableAutomationCronSchedule(candidate)) {
      const label = formatUiAutomationSchedule(candidate)
      return { label, title: formatUiAutomationScheduleTitle(candidate, label) }
    }
  }

  if (providerSchedule) {
    return {
      label: providerSchedule.replace(/\s+@\s+.+$/, '')
    }
  }

  return {
    label: translate(
      'auto.components.automations.external.automation.schedule.display.a8e92b815a',
      'Schedule unavailable'
    )
  }
}
