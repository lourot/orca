import { describe, expect, it } from 'vitest'
import { formatJiraDueDate, isJiraIssueOverdue, parseJiraDueDate } from './task-page-jira-due-date'

// Local noon, so the local calendar date is 2026-10-31 in every time zone.
const now = new Date(2026, 9, 31, 12)

describe('Jira due date', () => {
  it.each([
    { dueDate: '2026-10-30', category: 'indeterminate', overdue: true },
    { dueDate: '2026-10-31', category: 'new', overdue: false },
    { dueDate: '2026-11-01', category: 'new', overdue: false },
    { dueDate: '2026-10-30', category: 'done', overdue: false },
    { dueDate: 'soon', category: 'new', overdue: false }
  ])('treats $dueDate in $category as overdue: $overdue', ({ dueDate, category, overdue }) => {
    expect(isJiraIssueOverdue(dueDate, category, now)).toBe(overdue)
  })

  it('formats the local calendar day, adds the year only outside this one, and keeps unparsable values', () => {
    // Local midnight on the 5th; a UTC parse is off by the zone offset outside UTC.
    expect(parseJiraDueDate('2026-11-05')).toEqual(new Date(2026, 10, 5))
    expect(formatJiraDueDate('2026-11-05', now)).toMatch(/\b5\b/)
    expect(formatJiraDueDate('2026-11-05', now)).not.toMatch(/2026/)
    expect(formatJiraDueDate('2027-01-05', now)).toMatch(/2027/)
    expect(formatJiraDueDate('soon', now)).toBe('soon')
  })
})
