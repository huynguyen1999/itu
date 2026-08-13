import { describe, expect, it } from 'vitest';
import { projectTaskToCalendarItem } from './calendarProjection';
import type { ProductivityTask } from '@/shared/api/types';

const baseTask = {
  id: 'task-1',
  title: 'Test Task',
  status: 'PLANNED',
  priority: 'MEDIUM',
  createdAt: '2026-08-12T00:00:00Z',
  updatedAt: '2026-08-12T00:00:00Z',
  version: 1,
  tags: [],
  reminders: [],
  important: false,
  urgent: false,
  descriptionMarkdown: '',
  urgencyReason: '',
  sortOrder: 0,
} as unknown as ProductivityTask;

describe('projectTaskToCalendarItem', () => {
  it('projects scheduled task to TASK_DURATION item', () => {
    const task: ProductivityTask = {
      ...baseTask,
      scheduledStartAt: '2026-08-12T09:00:00Z',
      scheduledEndAt: '2026-08-12T10:30:00Z',
    };
    const projected = projectTaskToCalendarItem(task);
    expect(projected).toEqual({
      id: 'task-duration-task-1',
      kind: 'TASK_DURATION',
      title: 'Test Task',
      startAt: '2026-08-12T09:00:00Z',
      endAt: '2026-08-12T10:30:00Z',
      allDay: false,
      dueAt: undefined,
      color: null,
      readOnly: false,
      status: 'PLANNED',
      taskId: 'task-1',
      priority: 'MEDIUM',
      description: '',
    });
  });

  it('projects due-only task to TASK_DUE item', () => {
    const task: ProductivityTask = {
      ...baseTask,
      dueAt: '2026-08-12T21:00:00Z',
    };
    const projected = projectTaskToCalendarItem(task);
    expect(projected?.kind).toBe('TASK_DUE');
    expect(projected?.startAt).toBe('2026-08-12T21:00:00Z');
    expect(projected?.allDay).toBe(true);
  });

  it('returns null for unscheduled task without due date', () => {
    const projected = projectTaskToCalendarItem(baseTask);
    expect(projected).toBeNull();
  });

  it('returns null for completed tasks when showCompleted is false', () => {
    const task: ProductivityTask = {
      ...baseTask,
      status: 'COMPLETED',
      dueAt: '2026-08-12T21:00:00Z',
    };
    expect(projectTaskToCalendarItem(task, { showCompleted: false })).toBeNull();
    expect(projectTaskToCalendarItem(task, { showCompleted: true })?.kind).toBe('TASK_DUE');
  });

  it('returns null for archived tasks', () => {
    const task: ProductivityTask = {
      ...baseTask,
      status: 'ARCHIVED',
      dueAt: '2026-08-12T21:00:00Z',
    };
    expect(projectTaskToCalendarItem(task)).toBeNull();
  });
});
