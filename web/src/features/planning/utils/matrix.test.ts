import { describe, expect, it } from 'vitest';
import type { ProductivityTask, TaskStatus } from '@/shared/api/types';
import { attachTaskLists, bucketTasksByStatus } from '../MatrixPage';
import { reorderedTaskIds } from '../PlanningPage';

const task = (id: string, status: TaskStatus = 'INBOX') => ({ id, status }) as ProductivityTask;

describe('bucketTasksByStatus', () => {
  const tasks = [task('active', 'INBOX'), task('done', 'COMPLETED'), task('wont', 'CANCELED')];

  it('splits tasks into active, completed, and won’t-do buckets', () => {
    const { active, completed, wontDo } = bucketTasksByStatus(tasks);
    expect(active.map(({ id }) => id)).toEqual(['active']);
    expect(completed.map(({ id }) => id)).toEqual(['done']);
    expect(wontDo.map(({ id }) => id)).toEqual(['wont']);
  });
});

describe('attachTaskLists', () => {
  it('hydrates matrix tasks with their list for inline row metadata', () => {
    const matrixTask = { ...task('task-1'), taskListId: 'list-1', taskList: null };
    const taskList = { id: 'list-1', title: 'Personal', color: '#167f71', version: 1 };

    expect(attachTaskLists([matrixTask], [taskList])[0]?.taskList).toEqual(taskList);
  });
});

describe('matrix manual ordering', () => {
  it('moves a task before another task in the same quadrant', () => {
    const groups: Array<[string, ProductivityTask[]]> = [
      ['doFirst', [task('a'), task('b'), task('c')]],
      ['schedule', [task('d')]],
    ];

    expect(reorderedTaskIds(groups, 'c', 'doFirst', 'b')).toEqual(['a', 'c', 'b', 'd']);
  });

  it('moves a task to the end of its quadrant', () => {
    const groups: Array<[string, ProductivityTask[]]> = [
      ['doFirst', [task('a'), task('b'), task('c')]],
      ['schedule', [task('d')]],
    ];

    expect(reorderedTaskIds(groups, 'a', 'doFirst')).toEqual(['b', 'c', 'a', 'd']);
  });
});
