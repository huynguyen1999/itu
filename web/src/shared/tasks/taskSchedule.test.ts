import { describe, expect, it } from 'vitest';
import type { TaskInput } from '../api/types';
import {
  clearDuration,
  moveDueTask,
  moveDurationTask,
  resizeTaskEnd,
  resizeTaskStart,
  scheduleUnscheduledTask,
} from './taskSchedule';

const task = (overrides: Partial<TaskInput> = {}): TaskInput => ({
  title: 'T',
  scheduledStartAt: '2026-08-10T10:00:00.000Z',
  scheduledEndAt: '2026-08-10T11:30:00.000Z',
  ...overrides,
});

describe('taskSchedule', () => {
  it('preserves duration when moving', () => {
    const edit = moveDurationTask(task(), new Date('2026-08-11T14:00:00.000Z'));
    expect(edit.scheduledStartAt).toBe('2026-08-11T14:00:00.000Z');
    expect(edit.scheduledEndAt).toBe('2026-08-11T15:30:00.000Z');
  });

  it('resizes start', () => {
    const edit = resizeTaskStart(task(), new Date('2026-08-10T11:00:00.000Z'));
    expect(edit.scheduledStartAt).toBe('2026-08-10T11:00:00.000Z');
    expect(edit.scheduledEndAt).toBe('2026-08-10T11:30:00.000Z');
  });

  it('resizes end', () => {
    const edit = resizeTaskEnd(task(), new Date('2026-08-10T13:00:00.000Z'));
    expect(edit.scheduledStartAt).toBe('2026-08-10T10:00:00.000Z');
    expect(edit.scheduledEndAt).toBe('2026-08-10T13:00:00.000Z');
  });

  it('clears duration', () => {
    const edit = clearDuration();
    expect(edit.scheduledStartAt).toBeNull();
    expect(edit.scheduledEndAt).toBeNull();
  });

  it('rejects end <= start for resize start', () => {
    expect(() => resizeTaskStart(task(), new Date('2026-08-10T12:00:00.000Z'))).toThrow(
      'Scheduled start must be before scheduled end',
    );
  });

  it('rejects end <= start for resize end', () => {
    expect(() => resizeTaskEnd(task(), new Date('2026-08-10T09:00:00.000Z'))).toThrow(
      'Scheduled end must be after scheduled start',
    );
  });

  it('moves a due-only task preserving time of day', () => {
    const existing = new Date('2026-08-10T16:30:00.000Z');
    const edit = moveDueTask(task({ dueAt: existing.toISOString() }), new Date(2026, 7, 14));
    const result = new Date(edit.dueAt!);
    expect(result.getHours()).toBe(existing.getHours());
    expect(result.getMinutes()).toBe(existing.getMinutes());
    expect(result.getDate()).toBe(14);
    expect(result.getMonth()).toBe(7);
    expect(edit.scheduledStartAt).toBeUndefined();
  });

  it('schedules an unscheduled task at the default due time', () => {
    const edit = scheduleUnscheduledTask(task({ dueAt: undefined }), new Date(2026, 7, 14), '09:15');
    const result = new Date(edit.dueAt!);
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(15);
    expect(result.getDate()).toBe(14);
  });

  it('clocks the duration pair with one identical timestamp', () => {
    const edit = moveDurationTask(task(), new Date('2026-08-11T14:00:00.000Z'));
    expect(edit.fieldEditedAt.scheduledStartAt).toBe(edit.fieldEditedAt.scheduledEndAt);
  });

  it('clocks only dueAt for due-only edits', () => {
    const edit = moveDueTask(task({ dueAt: '2026-08-10T16:30:00.000Z' }), new Date('2026-08-14T00:00:00.000Z'));
    expect(edit.fieldEditedAt).toEqual({ dueAt: expect.any(String) });
  });
});
