import { describe, expect, it } from 'vitest'
import { formatTaskDueDate, isTaskOverdue, parseTaskDueDate } from './task-due-date'

// Local noon, so the local calendar date is 2026-10-31 in every time zone.
const now = new Date(2026, 9, 31, 12)

describe('task due date', () => {
  it.each([
    { dueDate: '2026-10-30', done: false, overdue: true },
    { dueDate: '2026-10-31', done: false, overdue: false },
    { dueDate: '2026-11-01', done: false, overdue: false },
    { dueDate: '2026-10-30', done: true, overdue: false },
    { dueDate: 'soon', done: false, overdue: false }
  ])('treats $dueDate (done: $done) as overdue: $overdue', ({ dueDate, done, overdue }) => {
    expect(isTaskOverdue(dueDate, done, now)).toBe(overdue)
  })

  it('formats the local calendar day, adds the year only outside this one, and keeps unparsable values', () => {
    // Local midnight on the 5th; a UTC parse is off by the zone offset outside UTC.
    expect(parseTaskDueDate('2026-11-05')).toEqual(new Date(2026, 10, 5))
    expect(formatTaskDueDate('2026-11-05', now)).toMatch(/\b5\b/)
    expect(formatTaskDueDate('2026-11-05', now)).not.toMatch(/2026/)
    expect(formatTaskDueDate('2027-01-05', now)).toMatch(/2027/)
    expect(formatTaskDueDate('soon', now)).toBe('soon')
  })
})
