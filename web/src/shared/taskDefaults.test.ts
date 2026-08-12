import { describe, expect, it } from 'vitest';
import { applyTaskDefaults, type TaskDefaults } from './taskDefaults';

const defaults: TaskDefaults = {
  date: 'NONE',
  priority: 'LOW',
  taskListId: 'list-1',
};

describe('applyTaskDefaults', () => {
  it('fills unset task fields', () => {
    expect(applyTaskDefaults({ title: 'Task' }, defaults)).toEqual({
      title: 'Task',
      priority: 'LOW',
      taskListId: 'list-1',
      dueAt: undefined,
    });
  });

  it('preserves explicit task choices', () => {
    expect(
      applyTaskDefaults(
        { title: 'Task', priority: 'HIGH', taskListId: null, dueAt: '2026-07-25T10:00:00.000Z' },
        defaults,
      ),
    ).toEqual({
      title: 'Task',
      priority: 'HIGH',
      taskListId: null,
      dueAt: '2026-07-25T10:00:00.000Z',
    });
  });

  it('uses 21:00 for date presets', () => {
    const result = applyTaskDefaults({ title: 'Task' }, { ...defaults, date: 'TOMORROW' });
    expect(new Date(result.dueAt!).getHours()).toBe(21);
  });
});
