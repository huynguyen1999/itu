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

  it('uses the scheduled start as the explicit reminder anchor when no due date exists', () => {
    const value = calculateRelativeReminderAt(
      { scheduledStartAt: '2026-08-15T16:00:00.000Z' },
      { relativeTo: 'SCHEDULE_START_AT', offsetMinutes: -30 },
    );
    expect(value.toISOString()).toBe('2026-08-15T15:30:00.000Z');
  });

  it('rejects relative reminders without an anchor or with invalid local times', () => {
    expect(() => calculateRelativeReminderAt({}, { relativeTo: 'DUE_AT', offsetMinutes: 10 })).toThrow(
      'Relative reminders require a due date or scheduled start',
    );
    expect(() => calculateRelativeReminderAt(
      { dueAt: '2026-08-15T14:00:00.000Z' },
      { timeOfDayMinutes: 1_440 },
    )).toThrow('Reminder time must be within a day');
    expect(() => calculateRelativeReminderAt(
      { dueAt: '2026-08-15T14:00:00.000Z' },
      { timeOfDayMinutes: 540, timeZone: 'Not/A_Timezone' },
    )).toThrow('Reminder time zone is invalid');
  });

  it('rejects an inverted scheduled range without comparing the due date', () => {
    expect(() => validateTaskSchedule({ scheduledStartAt: '2026-08-15T16:00:00.000Z', scheduledEndAt: '2026-08-15T15:00:00.000Z' })).toThrow(
      'Scheduled start must be before scheduled end',
    );
    expect(() => validateTaskSchedule({ scheduledStartAt: '2026-08-15T16:00:00.000Z', scheduledEndAt: '2026-08-15T17:00:00.000Z', dueAt: '2026-08-15T12:00:00.000Z' })).not.toThrow();
  });
});
