import { HabitScheduleType, TaskPriority } from '@prisma/client';
import { deriveUrgency, focusedSeconds, isHabitScheduled } from './productivity-rules';

describe('productivity rules', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');

  it('uses an explicit urgency override before derived rules', () => {
    expect(
      deriveUrgency(
        { urgentOverride: false, dueAt: new Date('2026-07-23T00:00:00Z'), priority: TaskPriority.HIGH },
        now,
      ),
    ).toEqual({ urgent: false, urgencyReason: 'Marked not urgent' });
  });

  it('derives urgency from overdue, near due, and high priority tasks', () => {
    expect(
      deriveUrgency({ urgentOverride: null, dueAt: new Date('2026-07-23T00:00:00Z'), priority: TaskPriority.NONE }, now)
        .urgencyReason,
    ).toBe('Overdue');
    expect(
      deriveUrgency({ urgentOverride: null, dueAt: new Date('2026-07-25T00:00:00Z'), priority: TaskPriority.NONE }, now)
        .urgencyReason,
    ).toBe('Due within 48 hours');
    expect(deriveUrgency({ urgentOverride: null, dueAt: null, priority: TaskPriority.HIGH }, now).urgencyReason).toBe(
      'High priority',
    );
  });

  it('generates weekday habits but excludes configured rest days', () => {
    const habit = {
      scheduleType: HabitScheduleType.WEEKDAYS,
      weekdays: [1, 2, 3, 4, 5],
      intervalDays: null,
      restDays: [3],
      startDate: new Date('2026-07-20T18:30:00+07:00'),
      endDate: null,
    };
    expect(isHabitScheduled(habit, new Date('2026-07-21T00:00:00Z'))).toBe(true);
    expect(isHabitScheduled(habit, new Date('2026-07-22T00:00:00Z'))).toBe(false);
    expect(isHabitScheduled(habit, new Date('2026-07-26T00:00:00Z'))).toBe(false);
  });

  it('generates interval habits deterministically', () => {
    const habit = {
      scheduleType: HabitScheduleType.INTERVAL,
      weekdays: [],
      intervalDays: 3,
      restDays: [],
      startDate: new Date('2026-07-20T00:00:00Z'),
      endDate: null,
    };
    expect(isHabitScheduled(habit, new Date('2026-07-23T00:00:00Z'))).toBe(true);
    expect(isHabitScheduled(habit, new Date('2026-07-24T00:00:00Z'))).toBe(false);
  });

  it('creates one period occurrence for weekly and monthly aggregate habits', () => {
    const base = {
      scheduleType: HabitScheduleType.TIMES_PER_PERIOD,
      weekdays: [],
      intervalDays: null,
      restDays: [],
      startDate: new Date('2026-07-01T00:00:00Z'),
      endDate: null,
    };
    expect(isHabitScheduled({ ...base, period: 'WEEK' }, new Date('2026-07-20T00:00:00Z'))).toBe(true);
    expect(isHabitScheduled({ ...base, period: 'WEEK' }, new Date('2026-07-21T00:00:00Z'))).toBe(false);
    expect(isHabitScheduled({ ...base, period: 'MONTH' }, new Date('2026-08-01T00:00:00Z'))).toBe(true);
    expect(isHabitScheduled({ ...base, period: 'MONTH' }, new Date('2026-08-02T00:00:00Z'))).toBe(false);
  });

  it('computes verified focus seconds and honors adjustments', () => {
    expect(
      focusedSeconds({
        startedAt: new Date('2026-07-24T10:00:00Z'),
        completedAt: new Date('2026-07-24T10:30:00Z'),
        adjustedStartedAt: null,
        adjustedCompletedAt: null,
        accumulatedPauseSecs: 300,
      }),
    ).toBe(1500);
    expect(
      focusedSeconds({
        startedAt: new Date('2026-07-24T10:00:00Z'),
        completedAt: new Date('2026-07-24T10:30:00Z'),
        adjustedStartedAt: new Date('2026-07-24T10:05:00Z'),
        adjustedCompletedAt: new Date('2026-07-24T10:20:00Z'),
        accumulatedPauseSecs: 0,
      }),
    ).toBe(900);
  });
});
