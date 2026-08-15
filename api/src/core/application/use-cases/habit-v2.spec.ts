import { HabitDirection, HabitScheduleType, HabitTargetType } from '@prisma/client';
import {
  calculateInsights,
  calculateStreaks,
  isHabitDateInRange,
  isHabitScheduled,
  localDateTimeToUtc,
  logicalLocalDate,
  projectHabitDays,
  statusForValue,
} from './habit-v2';

describe('Habits V2 rules', () => {
  const daily = {
    scheduleType: HabitScheduleType.WEEKDAYS,
    weekdays: [1, 3, 5],
    intervalDays: null,
    timesPerPeriod: null,
    period: null,
    restDays: [],
    startDate: new Date('2026-08-03T00:00:00Z'),
    endDate: null,
    timezone: 'UTC',
    direction: HabitDirection.BUILD,
    targetType: HabitTargetType.DURATION,
    targetValue: 30,
    allowedSkips: 1,
  } as const;

  it('uses scheduled opportunities and ignores non-scheduled days', () => {
    expect(isHabitScheduled(daily, '2026-08-03')).toBe(true);
    expect(isHabitScheduled(daily, '2026-08-04')).toBe(false);
    expect(isHabitScheduled({ ...daily, restDays: [3] }, '2026-08-05')).toBe(false);
  });

  it('projects virtual missed days without requiring stored occurrences', () => {
    const states = projectHabitDays(daily, '2026-08-03', '2026-08-07', [], new Date('2026-08-08T12:00:00Z'));
    expect(states.filter((state) => state.scheduled).map((state) => state.status)).toEqual(['MISSED', 'MISSED', 'MISSED']);
  });

  it('projects interval opportunities from the habit start date', () => {
    const habit = { ...daily, scheduleType: HabitScheduleType.INTERVAL, intervalDays: 2 };
    expect(['2026-08-03', '2026-08-05', '2026-08-07'].map((date) => isHabitScheduled(habit, date))).toEqual([true, true, true]);
    expect(isHabitScheduled(habit, '2026-08-04')).toBe(false);
  });

  it('treats BUILD and LIMIT completion differently while active', () => {
    expect(statusForValue({ ...daily, direction: HabitDirection.BUILD, targetValue: 30 }, 30)).toBe('COMPLETED');
    expect(statusForValue({ ...daily, direction: HabitDirection.LIMIT, targetValue: 2 }, 0)).toBe('PENDING');
    expect(statusForValue({ ...daily, direction: HabitDirection.LIMIT, targetValue: 2 }, 3)).toBe('FAILED');
    expect(statusForValue({ ...daily, direction: HabitDirection.LIMIT, targetValue: 2 }, 2, undefined, true)).toBe('COMPLETED');
    expect(statusForValue({ ...daily, direction: HabitDirection.LIMIT, targetValue: 2 }, 1, 'COMPLETED')).toBe('PENDING');
  });

  it('uses period targets and period streak units', () => {
    const habit = {
      ...daily,
      scheduleType: HabitScheduleType.TIMES_PER_PERIOD,
      timesPerPeriod: 3,
      period: 'WEEK',
    };
    const states = projectHabitDays(habit, '2026-08-03', '2026-08-16', [
      { occurrenceDate: new Date('2026-08-03T00:00:00Z'), status: 'COMPLETED', value: 3 },
      { occurrenceDate: new Date('2026-08-10T00:00:00Z'), status: 'COMPLETED', value: 3 },
    ], new Date('2026-08-17T12:00:00Z'));
    expect(states).toHaveLength(2);
    expect(calculateStreaks(habit, states)).toEqual({ currentStreak: 2, bestStreak: 2, streakUnit: 'PERIOD' });
  });

  it('projects monthly frequency as one period bucket per month', () => {
    const habit = { ...daily, scheduleType: HabitScheduleType.TIMES_PER_PERIOD, timesPerPeriod: 2, period: 'MONTH' };
    const states = projectHabitDays(habit, '2026-08-15', '2026-09-15', [
      { occurrenceDate: new Date('2026-08-01T00:00:00Z'), status: 'COMPLETED', value: 2 },
      { occurrenceDate: new Date('2026-09-01T00:00:00Z'), status: 'COMPLETED', value: 2 },
    ], new Date('2026-09-16T12:00:00Z'));
    expect(states.map((state) => state.localDate)).toEqual(['2026-08-01', '2026-09-01']);
    expect(calculateStreaks(habit, states).streakUnit).toBe('PERIOD');
  });

  it('accepts a period bucket when a habit starts mid-period without accepting dates before its start', () => {
    const habit = { ...daily, scheduleType: HabitScheduleType.TIMES_PER_PERIOD, timesPerPeriod: 3, period: 'WEEK', startDate: new Date('2026-08-05T00:00:00Z') };
    expect(isHabitDateInRange(habit, '2026-08-04')).toBe(false);
    expect(isHabitDateInRange(habit, '2026-08-06')).toBe(true);
    expect(isHabitScheduled(habit, '2026-08-03')).toBe(true);
    expect(projectHabitDays(habit, '2026-08-05', '2026-08-09', [], new Date('2026-08-10T12:00:00Z')).map((state) => state.localDate)).toEqual(['2026-08-03']);
  });

  it('does not count an allowed skip but keeps the surrounding streak alive', () => {
    const states = [
      { localDate: '2026-08-03', scheduled: true, status: 'COMPLETED' as const, value: 1, targetValue: 1, progressRatio: 1 },
      { localDate: '2026-08-05', scheduled: true, status: 'SKIPPED' as const, value: 0, targetValue: 1, progressRatio: 0 },
      { localDate: '2026-08-07', scheduled: true, status: 'COMPLETED' as const, value: 1, targetValue: 1, progressRatio: 1 },
    ];
    expect(calculateStreaks(daily, states)).toEqual({ currentStreak: 2, bestStreak: 2, streakUnit: 'DAY' });
  });

  it('recomputes a backfilled opportunity as part of the same streak', () => {
    const before = [
      { localDate: '2026-08-03', scheduled: true, status: 'COMPLETED' as const, value: 1, targetValue: 1, progressRatio: 1 },
      { localDate: '2026-08-04', scheduled: true, status: 'MISSED' as const, value: 0, targetValue: 1, progressRatio: 0 },
      { localDate: '2026-08-05', scheduled: true, status: 'COMPLETED' as const, value: 1, targetValue: 1, progressRatio: 1 },
    ];
    const after = before.map((state) => state.localDate === '2026-08-04' ? { ...state, status: 'COMPLETED' as const, value: 1, progressRatio: 1 } : state);
    expect(calculateStreaks(daily, before).currentStreak).toBe(1);
    expect(calculateStreaks(daily, after)).toEqual({ currentStreak: 3, bestStreak: 3, streakUnit: 'DAY' });
  });

  it('honors rollover in the habit timezone', () => {
    expect(logicalLocalDate(new Date('2026-08-15T22:30:00Z'), 'Asia/Ho_Chi_Minh', 4)).toBe('2026-08-16');
    expect(logicalLocalDate(new Date('2026-08-15T22:30:00Z'), 'Asia/Ho_Chi_Minh', 21)).toBe('2026-08-15');
  });

  it('converts reminder wall time across DST', () => {
    expect(localDateTimeToUtc('2026-03-08', '09:00', 'America/New_York')).toEqual(new Date('2026-03-08T13:00:00.000Z'));
    expect(localDateTimeToUtc('2026-11-01', '09:00', 'America/New_York')).toEqual(new Date('2026-11-01T14:00:00.000Z'));
  });

  it('returns compact insight metrics', () => {
    const states = projectHabitDays(daily, '2026-07-20', '2026-08-18', [], new Date('2026-08-19T12:00:00Z'));
    const insights = calculateInsights(daily, states, '2026-08-18');
    expect(insights.heatmap).toHaveLength(30);
    expect(insights.streakUnit).toBe('DAY');
    expect(insights.last30Rate).toBe(0);
  });

  it('projects the mixed 100-habit benchmark fixture without materializing history', () => {
    const habits = Array.from({ length: 100 }, (_, index) => ({
      ...daily,
      scheduleType: index % 3 === 0 ? HabitScheduleType.WEEKDAYS : index % 3 === 1 ? HabitScheduleType.INTERVAL : HabitScheduleType.TIMES_PER_PERIOD,
      weekdays: index % 3 === 0 ? [1, 3, 5] : [],
      intervalDays: index % 3 === 1 ? 2 + (index % 5) : null,
      timesPerPeriod: index % 3 === 2 ? 2 + (index % 4) : null,
      period: index % 3 === 2 ? (index % 2 === 0 ? 'WEEK' : 'MONTH') : null,
      targetType: index % 4 === 0 ? HabitTargetType.BOOLEAN : index % 4 === 1 ? HabitTargetType.COUNT : index % 4 === 2 ? HabitTargetType.DURATION : HabitTargetType.QUANTITY,
      targetValue: 1 + (index % 5),
      direction: index % 5 === 0 ? HabitDirection.LIMIT : HabitDirection.BUILD,
    }));
    const projectedCells = habits.reduce((total, habit, index) => total + projectHabitDays(
      habit,
      '2025-08-15',
      '2026-08-14',
      [{ occurrenceDate: new Date('2026-08-01T00:00:00Z'), status: 'PENDING', value: index % 3 }],
      new Date('2026-08-15T12:00:00Z'),
    ).length, 0);

    expect(projectedCells).toBeGreaterThan(100);
    expect(projectedCells).toBeLessThanOrEqual(100 * 365);
  });
});
