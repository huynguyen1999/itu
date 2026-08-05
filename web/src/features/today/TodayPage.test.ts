import { describe, expect, it } from 'vitest';
import { todayTaskDueAt } from './TodayPage';

describe('Home task draft', () => {
  it('keeps a blank due date explicitly unscheduled', () => {
    expect(todayTaskDueAt('')).toBeNull();
    expect(todayTaskDueAt('2026-07-29T10:00:00.000Z')).toBe('2026-07-29T10:00:00.000Z');
  });
});
