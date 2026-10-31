import { getIntlLocale } from '@/i18n/i18n'

const DUE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** A Jira `YYYY-MM-DD` due date at local midnight; null when it doesn't parse. */
export function parseJiraDueDate(dueDate: string): Date | null {
  const match = DUE_DATE_PATTERN.exec(dueDate)
  // Why: new Date('YYYY-MM-DD') is UTC midnight, which shows the previous day west of UTC.
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}

/** A Jira `YYYY-MM-DD` due date as a short local date; the raw value when it doesn't parse. */
export function formatJiraDueDate(dueDate: string, now = new Date()): string {
  const date = parseJiraDueDate(dueDate)
  if (!date) {
    return dueDate
  }
  return new Intl.DateTimeFormat(getIntlLocale(), {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' })
  }).format(date)
}

/** Whether an issue that isn't done has passed its due date; due today is not overdue. */
export function isJiraIssueOverdue(
  dueDate: string,
  statusCategoryKey: string,
  now = new Date()
): boolean {
  return (
    statusCategoryKey !== 'done' && DUE_DATE_PATTERN.test(dueDate) && dueDate < localIsoDate(now)
  )
}
