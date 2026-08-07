import { describe, expect, it } from 'vitest';
import type { FocusSession } from '@/shared/api/types';
import {
  createOptimisticFocusSession,
  focusAccountXpForMinutes,
  focusDisplaySeconds,
  focusElapsedSeconds,
  formatFocusTime,
  parseDurationInput,
  validFocusMinutes,
} from './focusTimer';

const session: FocusSession = {
  id: 'session',
  mode: 'COUNTDOWN',
  phase: 'WORK',
  status: 'ACTIVE',
  plannedSeconds: 1500,
  accumulatedPauseSecs: 120,
  cycle: 1,
  tagNamesSnapshot: [],
  startedAt: '2026-07-24T10:00:00.000Z',
  version: 1,
};

describe('focus timer', () => {
  it('creates a locally active session before remote synchronization', () => {
    const optimistic = createOptimisticFocusSession({
      id: 'local-session',
      taskId: 'task',
      taskTitleSnapshot: 'Write tests',
      customTitle: 'Deep work',
      plannedSeconds: 1500,
      startedAt: '2026-07-24T10:00:00.000Z',
    });

    expect(optimistic).toMatchObject({
      id: 'local-session',
      taskId: 'task',
      taskTitleSnapshot: 'Write tests',
      customTitle: 'Deep work',
      status: 'ACTIVE',
      plannedSeconds: 1500,
      version: 1,
    });
  });

  it('uses server timestamps and excludes accumulated pauses', () => {
    const now = new Date('2026-07-24T10:10:00.000Z').getTime();
    expect(focusElapsedSeconds(session, now)).toBe(480);
    expect(focusDisplaySeconds(session, false, now)).toBe(1020);
  });

  it('prevents break sessions from entering overtime even when allowOvertime is true', () => {
    const now = new Date('2026-07-24T10:30:00.000Z').getTime(); // 30 mins elapsed
    const shortBreak: FocusSession = { ...session, phase: 'SHORT_BREAK', plannedSeconds: 300 }; // 5 mins planned
    expect(focusDisplaySeconds(shortBreak, true, now)).toBe(0);
  });

  it('formats time consistently including overtime', () => {
    expect(formatFocusTime(65)).toBe('01:05');
    expect(formatFocusTime(-90)).toBe('+01:30');
  });

  it.each([
    [4, 0],
    [5, 1],
    [75, 15],
    [100, 15],
  ])('caps focus account XP at 15 (%d minutes)', (minutes, expected) => {
    expect(focusAccountXpForMinutes(minutes)).toBe(expected);
  });

  it('computes valid completed minutes from adjusted timestamps and pauses', () => {
    const completed = {
      ...session,
      adjustedStartedAt: '2026-07-24T10:00:00.000Z',
      adjustedCompletedAt: '2026-07-24T11:20:00.000Z',
      accumulatedPauseSecs: 300,
    };
    expect(validFocusMinutes(completed)).toBe(75);
    expect(validFocusMinutes({ ...completed, completedAt: undefined, adjustedCompletedAt: undefined })).toBe(0);
  });

  it('parses duration string inputs consistently', () => {
    expect(parseDurationInput('45', 25)).toBe(45);
    expect(parseDurationInput('45:00', 25)).toBe(45);
    expect(parseDurationInput('15:30', 25)).toBe(16);
    expect(parseDurationInput('invalid', 25)).toBe(25);
    expect(parseDurationInput('0', 25)).toBe(1);
    expect(parseDurationInput('300', 25)).toBe(180);
  });
});
