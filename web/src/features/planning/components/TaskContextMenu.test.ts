import { describe, expect, it } from 'vitest';
import { taskDueDatePatch } from './TaskContextMenu';

describe('task context-menu due date', () => {
  it('uses an explicit null patch when the due date is removed', () => {
    expect(taskDueDatePatch(null)).toEqual({ dueAt: null });
    expect(taskDueDatePatch('2026-07-29T10:00:00.000Z')).toEqual({
      dueAt: '2026-07-29T10:00:00.000Z',
    });
  });
});
