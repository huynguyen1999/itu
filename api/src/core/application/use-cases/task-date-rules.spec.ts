import { calculateRelativeReminderAt, parseTaskDate, validateTaskSchedule } from './task-date-rules';

describe('task date rules', () => {
  it('uses 21:00 for date-only due dates in the local timezone', () => {
    const value = parseTaskDate('2026-08-15');
    expect(value).toBeInstanceOf(Date);
    expect(value?.getHours()).toBe(21);
    expect(value?.getMinutes()).toBe(0);
  });

  it('preserves explicit due times', () => {
    expect(parseTaskDate('2026-08-15T16:30:00.000Z')?.toISOString()).toBe('2026-08-15T16:30:00.000Z');
  });

  it('recalculates calendar-day reminders in the requested timezone', () => {
    const value = calculateRelativeReminderAt(
      { dueAt: '2026-08-15T14:00:00.000Z' },
      { relativeTo: 'DUE_AT', calendarDayOffset: -1, timeOfDayMinutes: 540, timeZone: 'Asia/Ho_Chi_Minh' },
    );
    expect(value.toISOString()).toBe('2026-08-14T02:00:00.000Z');
  });

  it('rejects an inverted scheduled range without comparing the due date', () => {
    expect(() => validateTaskSchedule({ scheduledStartAt: '2026-08-15T16:00:00.000Z', scheduledEndAt: '2026-08-15T15:00:00.000Z' })).toThrow(
      'Scheduled start must be before scheduled end',
    );
    expect(() => validateTaskSchedule({ scheduledStartAt: '2026-08-15T16:00:00.000Z', scheduledEndAt: '2026-08-15T17:00:00.000Z', dueAt: '2026-08-15T12:00:00.000Z' })).not.toThrow();
  });
});
