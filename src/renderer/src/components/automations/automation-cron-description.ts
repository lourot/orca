import cronstrue from 'cronstrue'
import 'cronstrue/locales/de'
import 'cronstrue/locales/es'
import 'cronstrue/locales/fr'
import 'cronstrue/locales/ja'
import 'cronstrue/locales/ko'
import 'cronstrue/locales/pt_PT'
import 'cronstrue/locales/ru'
import 'cronstrue/locales/tr'
import 'cronstrue/locales/zh_CN'
import 'cronstrue/locales/zh_TW'
import {
  getAutomationCronExpressionFields,
  isValidAutomationCronSchedule,
  parseCronExpression
} from '../../../../shared/automation-schedule-parsing'
import { escapeTerminalControlCharacters } from '../../../../shared/terminal-control-character-escape'
import { SUPPORTED_UI_LOCALES, type SupportedUiLocale } from '../../../../shared/ui-locale'
import { i18n } from '@/i18n/i18n'

const CRON_LOCALES = {
  en: 'en',
  zh: 'zh_CN',
  'zh-Hant': 'zh_TW',
  ko: 'ko',
  ja: 'ja',
  es: 'es',
  fr: 'fr',
  pt: 'pt_PT',
  ru: 'ru',
  tr: 'tr',
  de: 'de'
} satisfies Record<SupportedUiLocale, string>

/** Limit descriptions to syntax whose meaning agrees with Orca's cron dialect. */
function canDescribeCron(fields: readonly string[]): boolean {
  if (fields.length !== 5 || (fields[2] !== '*' && fields[4] !== '*')) {
    return false
  }
  return fields.every((field, index) => {
    const step = Number(/^\*\/(\d+)$/.exec(field)?.[1] ?? 1)
    const period = [60, 24, null, 12, 7][index]
    // Interval prose hides short rollover gaps; month lengths also vary.
    if (step > 1 && (period == null || period % step !== 0)) {
      return false
    }
    if (field.includes(',') && field.includes('*')) {
      return false
    }
    return field
      .split(',')
      .every(
        (term) =>
          /^(?:\*|\d{1,2}|[A-Z]{3})(?:-(?:\d{1,2}|[A-Z]{3}))?(?:\/\d{1,2})?$/i.test(term) &&
          !/^(?:\d+|[A-Z]+)\//i.test(term)
      )
  })
}

/** Describe validated custom cron for the desktop, falling back to its escaped source. */
export function describeCustomAutomationCron(expression: string): string {
  const trimmed = expression.trim()
  const fallback = escapeTerminalControlCharacters(trimmed, true)
  const fields = getAutomationCronExpressionFields(trimmed)
  if (!isValidAutomationCronSchedule(trimmed) || !canDescribeCron(fields)) {
    return fallback
  }
  const locale = SUPPORTED_UI_LOCALES.find((candidate) => candidate === i18n.language) ?? 'en'
  try {
    // Expand before replacing Sunday 7 so range endpoints and step offsets retain Orca's meaning.
    if (/(?:^|\D)7(?:$|\D)/.test(fields[4] ?? '')) {
      fields[4] = [...parseCronExpression(trimmed).daysOfWeek].sort((a, b) => a - b).join(',')
    }
    return cronstrue.toString(fields.join(' '), {
      locale: CRON_LOCALES[locale],
      use24HourTimeFormat:
        new Intl.DateTimeFormat(undefined, {
          hour: 'numeric'
        }).resolvedOptions().hour12 === false,
      dayOfWeekStartIndexZero: true,
      monthStartIndexZero: false,
      throwExceptionOnParseError: true
    })
  } catch {
    // Accepted Orca syntax can still be unsupported by the description library.
    return fallback
  }
}
