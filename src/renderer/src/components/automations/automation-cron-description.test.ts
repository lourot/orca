import cronstrue from 'cronstrue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SUPPORTED_UI_LOCALES } from '../../../../shared/ui-locale'
import { formatAutomationSchedule } from '../../../../shared/automation-schedules'
import { isRunnableAutomationCronSchedule } from '../../../../shared/automation-schedule-parsing'
import { i18n } from '@/i18n/i18n'
import { describeCustomAutomationCron } from './automation-cron-description'
import {
  formatUiAutomationSchedule,
  formatUiAutomationScheduleDescriptor,
  formatUiAutomationScheduleTitle
} from './automation-schedule-label'
import { getExternalAutomationScheduleDisplay } from './external-automation-schedule-display'
import { makeExternalManager } from './automations-page-fixtures'

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('en')
})

describe('desktop custom cron descriptions', () => {
  it.each([
    ['*/15 * * * *', ['15', 'minutes']],
    ['*/30 9-17 * * MON-FRI', ['30', 'Monday', 'Friday']],
    ['0 9,17 * * MON-FRI', ['Monday', 'Friday']],
    ['0 9 1 * *', ['day 1', 'month']],
    ['0 9 1,15 JAN,MAR *', ['day 1 and 15', 'January', 'March']],
    ['0 9 * * MON,WED,FRI', ['Monday', 'Wednesday', 'Friday']],
    ['0 0 29 FEB *', ['day 29', 'February']],
    ['*/10 * * * 0,6', ['10', 'Sunday', 'Saturday']],
    ['0 */6 * * *', ['6', 'hours']],
    ['0 9 * */3 *', ['3', 'months']],
    ['5-45/20 * * * *', ['20', '5', '45']]
  ])('describes the matching times of %s', (expression, fragments) => {
    const label = formatUiAutomationSchedule(expression)
    expect(label).not.toBe(expression)
    expect(label).not.toBe('Custom schedule')
    for (const fragment of fragments) {
      expect(label).toContain(fragment)
    }
  })

  it.each([
    '*/40 * * * *',
    '0 */7 * * *',
    '0 9 */2 * *',
    '0 9 * */5 *',
    '*/15 * * * */2',
    '0 9 1 * MON',
    '0 9 */2 * MON',
    '5/15 * * * *',
    '0 9 * MAR/3 *',
    '0 9 2,*/3 * *',
    '3 7 1 * 6-7',
    '*/15 9 * * MO,WE',
    '*/90 9,17 * * *',
    '*/15 +9 * * *',
    '*/15 0x9 * * *'
  ])('uses raw cron rather than a different dialect interpretation for %s', (expression) => {
    expect(isRunnableAutomationCronSchedule(expression)).toBe(true)
    const describe = vi.spyOn(cronstrue, 'toString')
    expect(formatUiAutomationSchedule(expression)).toBe(expression)
    expect(describe).not.toHaveBeenCalled()
  })

  it.each([
    ['6-7', [0, 6]],
    ['5-7', [0, 5, 6]],
    ['7,0,6,7', [0, 6]],
    ['1-7/2', [0, 1, 3, 5]],
    ['0-7/2', [0, 2, 4, 6]],
    ['6-7/2', [6]],
    ['0-7', [0, 1, 2, 3, 4, 5, 6]]
  ])('describes Sunday aliases using Orca weekday expansion: %s', (weekdays, expectedDays) => {
    const expression = `3 7 * * ${weekdays}`
    const describe = vi.spyOn(cronstrue, 'toString')
    const label = describeCustomAutomationCron(expression)
    expect(describe).toHaveBeenCalledWith(`3 7 * * ${expectedDays.join(',')}`, expect.any(Object))
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    expect(dayNames.filter((day) => label.includes(day))).toEqual(
      expectedDays.map((day) => dayNames[day])
    )
  })

  it('keeps the weekend source in the title while describing its time and days', () => {
    const resolved = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions()
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      ...resolved,
      hour12: true
    })
    const expression = '3 7 * * 6-7'
    const label = formatUiAutomationSchedule(expression)
    expect(label).toContain('07:03 AM')
    expect(label).toContain('Sunday')
    expect(label).toContain('Saturday')
    expect(formatUiAutomationScheduleTitle(expression, label)).toBe(`${label}\n${expression}`)
  })

  it('normalizes pasted field whitespace before describing it', () => {
    expect(formatUiAutomationSchedule('  */15\t*\n*\u00a0*\r*  ')).toBe(
      formatUiAutomationSchedule('*/15 * * * *')
    )
  })

  it('escapes the raw fallback when the library cannot describe an accepted rule', () => {
    vi.spyOn(cronstrue, 'toString').mockImplementation(() => {
      throw new Error('Unsupported library expression')
    })
    expect(formatUiAutomationSchedule('  */15\t* * * *  ')).toBe('*/15\\x09* * * *')
  })

  it.each(['not cron', '0 0 31 2 *', '0 9 * * MON#2', '0 9 * * * 2027'])(
    'keeps rejected schedules invalid without consulting the library: %s',
    (expression) => {
      const describe = vi.spyOn(cronstrue, 'toString')
      expect(formatUiAutomationSchedule(expression)).toBe('Invalid schedule')
      expect(describe).not.toHaveBeenCalled()
    }
  )

  it('preserves presets, RRULEs, editor descriptors and the CLI custom label', () => {
    const describe = vi.spyOn(cronstrue, 'toString')
    expect(formatUiAutomationSchedule('5 * * * *')).toBe('Hourly at :05')
    const rrule = 'FREQ=WEEKLY;BYDAY=TU,TH,SA;BYHOUR=8;BYMINUTE=0'
    expect(formatUiAutomationSchedule(rrule)).toBe(rrule)
    expect(formatUiAutomationScheduleDescriptor({ kind: 'custom' })).toBe('Custom schedule')
    expect(formatAutomationSchedule('*/15 * * * *')).toBe('Custom schedule')
    expect(describe).not.toHaveBeenCalled()
  })

  it('follows all built-in UI languages with the library locale equivalents', async () => {
    const locales = {
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
    }
    expect(Object.keys(locales)).toEqual(SUPPORTED_UI_LOCALES)
    for (const [language, locale] of Object.entries(locales)) {
      await i18n.changeLanguage(language)
      expect(formatUiAutomationSchedule('*/15 * * * *')).toBe(
        cronstrue.toString('*/15 * * * *', { locale })
      )
    }
  })

  it('uses English for a plugin language', async () => {
    await i18n.changeLanguage('plugin:example.language/ja')
    expect(formatUiAutomationSchedule('*/15 * * * *')).toBe('Every 15 minutes')
  })

  it.each([true, false])('follows the OS hour12 preference %s', (hour12) => {
    const resolved = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions()
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      ...resolved,
      hour12
    })
    const label = formatUiAutomationSchedule('0 9,17 * * *')
    expect(label).toContain(hour12 ? '05:00 PM' : '17:00')
  })

  it('retains the full label and source in the title without duplicating a raw fallback', () => {
    const expression = '*/15 * * * *'
    const label = formatUiAutomationSchedule(expression)
    expect(formatUiAutomationScheduleTitle(expression, label)).toBe(`${label}\n${expression}`)
    expect(formatUiAutomationScheduleTitle('  5/15 * * * *  ', '5/15 * * * *')).toBe('5/15 * * * *')
    expect(formatUiAutomationScheduleTitle('*/15\t* * * *', label)).toContain('*/15\\x09* * * *')
  })

  it('describes the provider raw schedule and its cron-prefixed fallback consistently', () => {
    const manager = makeExternalManager()
    const job = manager.jobs[0]
    if (!job) {
      throw new Error('Missing external job fixture')
    }
    const expression = '*/15 * * * *'
    const expected = {
      label: formatUiAutomationSchedule(expression),
      title: formatUiAutomationScheduleTitle(expression, formatUiAutomationSchedule(expression))
    }
    expect(
      getExternalAutomationScheduleDisplay(manager, { ...job, rawSchedule: expression })
    ).toEqual(expected)
    expect(
      getExternalAutomationScheduleDisplay(manager, {
        ...job,
        rawSchedule: null,
        schedule: `cron ${expression} @ Europe/Berlin`
      })
    ).toEqual(expected)
  })
})
