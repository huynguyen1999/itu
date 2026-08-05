import { describe, expect, it } from 'vitest';
import type { ProductivityTask } from '@/shared/api/types';
import {
  applyManualTaskOrder,
  countInbox,
  countToday,
  groupTasks,
  isInboxViewTask,
  kanbanGroups,
  manualMoveBeforeTaskId,
  reorderedTaskIds,
  sortTasks,
} from '../PlanningPage';

const task = (id: string) => ({ id }) as ProductivityTask;

describe('task manual ordering', () => {
  it('places completed tasks at the end of their matching Kanban column', () => {
    const active = { ...task('active'), status: 'PLANNED', dueAt: null } as ProductivityTask;
    const completed = { ...task('completed'), status: 'COMPLETED', dueAt: null } as ProductivityTask;

    expect(
      kanbanGroups(
        [
          ['No date', [active]],
          ["Completed & Won't Do", [completed]],
        ],
        'all',
        'time',
      ),
    ).toEqual([{ title: 'No date', tasks: [active], completedTasks: [completed] }]);
  });

  it('does not create completed-status Kanban columns', () => {
    const planned = { ...task('planned'), status: 'PLANNED' } as ProductivityTask;
    const completed = { ...task('completed'), status: 'COMPLETED' } as ProductivityTask;

    expect(
      kanbanGroups(
        [
          ['Planned', [planned]],
          ["Completed & Won't Do", [completed]],
        ],
        'all',
        'status',
      ),
    ).toEqual([{ title: 'Planned', tasks: [planned], completedTasks: [] }]);
  });

  it('moves a task before another task in the same group', () => {
    const groups: Array<[string, ProductivityTask[]]> = [['Tasks', [task('a'), task('b'), task('c')]]];

    expect(reorderedTaskIds(groups, 'c', 'Tasks', 'b')).toEqual(['a', 'c', 'b']);
  });

  it('moves a task to the end of another group', () => {
    const groups: Array<[string, ProductivityTask[]]> = [
      ['Inbox', [task('a'), task('b')]],
      ['Work', [task('c')]],
    ];

    expect(reorderedTaskIds(groups, 'a', 'Work')).toEqual(['b', 'c', 'a']);
  });

  it('calculates one-step manual move targets', () => {
    const tasks = [task('a'), task('b'), task('c'), task('d')];

    expect(manualMoveBeforeTaskId(tasks, 'c', 'up')).toBe('b');
    expect(manualMoveBeforeTaskId(tasks, 'b', 'down')).toBe('d');
    expect(manualMoveBeforeTaskId(tasks, 'd', 'down')).toBe('d');
    expect(manualMoveBeforeTaskId(tasks, 'a', 'up')).toBe('a');
  });

  it('applies manual order locally after a drop', () => {
    const tasks = [
      { ...task('a'), sortOrder: 1 },
      { ...task('b'), sortOrder: 2 },
      { ...task('c'), sortOrder: 3 },
    ] as ProductivityTask[];

    expect(applyManualTaskOrder(tasks, ['b', 'c', 'a'], 'a').map(({ id, sortOrder }) => [id, sortOrder])).toEqual([
      ['a', 3],
      ['b', 1],
      ['c', 2],
    ]);
  });

  it('applies the group move patch to the dragged task locally', () => {
    const tasks = [
      { ...task('a'), sortOrder: 1, priority: 'NONE' },
      { ...task('b'), sortOrder: 2, priority: 'HIGH' },
    ] as ProductivityTask[];

    expect(
      applyManualTaskOrder(tasks, ['b', 'a'], 'a', { priority: 'HIGH' }).find((item) => item.id === 'a'),
    ).toMatchObject({
      priority: 'HIGH',
      sortOrder: 2,
    });
  });

  it('keeps manual order oldest-first when sort orders tie', () => {
    const tasks = [
      { ...task('4'), sortOrder: 0, createdAt: '2026-07-27T00:00:04.000Z' },
      { ...task('3'), sortOrder: 0, createdAt: '2026-07-27T00:00:03.000Z' },
      { ...task('2'), sortOrder: 0, createdAt: '2026-07-27T00:00:02.000Z' },
      { ...task('1'), sortOrder: 0, createdAt: '2026-07-27T00:00:01.000Z' },
    ] as ProductivityTask[];

    expect(sortTasks(tasks, 'manual').map(({ id }) => id)).toEqual(['1', '2', '3', '4']);
  });

  it('keeps an unassigned in-progress task in Inbox when grouping by project', () => {
    const unassigned = {
      ...task('a'),
      status: 'IN_PROGRESS',
      taskList: null,
      project: null,
    } as ProductivityTask;

    expect(groupTasks([unassigned], 'all', 'project', [])).toEqual([['Inbox', [unassigned]]]);
  });

  it('sorts newest created tasks first by default sort mode', () => {
    const older = { ...task('older'), createdAt: '2026-07-26T00:00:00.000Z' } as ProductivityTask;
    const newer = { ...task('newer'), createdAt: '2026-07-27T00:00:00.000Z' } as ProductivityTask;

    expect(sortTasks([older, newer], 'created-desc')).toEqual([newer, older]);
  });

  it('keeps rapid-created tasks stable when created timestamps tie', () => {
    const createdAt = '2026-07-27T00:00:00.000Z';
    const first = { ...task('1'), createdAt } as ProductivityTask;
    const second = { ...task('2'), createdAt } as ProductivityTask;
    const third = { ...task('3'), createdAt } as ProductivityTask;

    expect(sortTasks([first, second, third], 'created-desc')).toEqual([first, second, third]);
  });

  it('sorts oldest created tasks first when requested', () => {
    const older = { ...task('older'), createdAt: '2026-07-26T00:00:00.000Z' } as ProductivityTask;
    const newer = { ...task('newer'), createdAt: '2026-07-27T00:00:00.000Z' } as ProductivityTask;

    expect(sortTasks([newer, older], 'created-asc')).toEqual([older, newer]);
  });

  it('keeps rapid-created tasks stable in oldest-created mode when timestamps tie', () => {
    const createdAt = '2026-07-27T00:00:00.000Z';
    const first = { ...task('1'), createdAt } as ProductivityTask;
    const second = { ...task('2'), createdAt } as ProductivityTask;
    const third = { ...task('3'), createdAt } as ProductivityTask;

    expect(sortTasks([first, second, third], 'created-asc')).toEqual([first, second, third]);
  });

  it('sorts recently modified tasks first', () => {
    const stale = { ...task('stale'), updatedAt: '2026-07-26T00:00:00.000Z' } as ProductivityTask;
    const fresh = { ...task('fresh'), updatedAt: '2026-07-27T00:00:00.000Z' } as ProductivityTask;

    expect(sortTasks([stale, fresh], 'modified-desc')).toEqual([fresh, stale]);
  });

  it('groups dated tasks into planning time buckets', () => {
    const now = new Date();
    const today = { ...task('today'), status: 'PLANNED', dueAt: now.toISOString() } as ProductivityTask;
    const tomorrow = {
      ...task('tomorrow'),
      status: 'PLANNED',
      dueAt: new Date(now.getTime() + 86_400_000).toISOString(),
    } as ProductivityTask;
    const unscheduled = { ...task('unscheduled'), status: 'PLANNED', dueAt: null } as ProductivityTask;

    expect(groupTasks([unscheduled, tomorrow, today], 'all', 'time', [])).toEqual([
      ['No date', [unscheduled]],
      ['Tomorrow', [tomorrow]],
      ['Today', [today]],
    ]);
  });

  it('groups tasks by their first tag and keeps untagged tasks visible', () => {
    const tagged = {
      ...task('tagged'),
      status: 'PLANNED',
      tags: [{ tag: { id: 'tag-1', name: 'Work', color: 'BLUE' } }],
    } as ProductivityTask;
    const untagged = { ...task('untagged'), status: 'PLANNED', tags: [] } as unknown as ProductivityTask;

    expect(groupTasks([tagged, untagged], 'all', 'tag', [])).toEqual([
      ['#Work', [tagged]],
      ['No tag', [untagged]],
    ]);
  });
});

describe('task navigation counts', () => {
  it('recognizes tasks stored in the default Inbox list', () => {
    const taskInDefaultInbox = {
      ...task('default-inbox'),
      status: 'INBOX',
      taskListId: 'inbox-list',
      scheduledStartAt: null,
    } as ProductivityTask;

    expect(isInboxViewTask(taskInDefaultInbox, 'inbox-list')).toBe(true);
    expect(isInboxViewTask({ ...taskInDefaultInbox, taskListId: 'work-list' }, 'inbox-list')).toBe(false);
  });

  it('counts only unscheduled unassigned inbox tasks', () => {
    const inboxTask = {
      ...task('inbox'),
      status: 'INBOX',
      taskListId: null,
      projectId: null,
      scheduledStartAt: null,
    } as ProductivityTask;
    const scheduledTask = { ...inboxTask, id: 'scheduled', scheduledStartAt: new Date().toISOString() };
    const projectTask = { ...inboxTask, id: 'project', taskListId: 'list-1' };
    const completedTask = { ...inboxTask, id: 'completed', status: 'COMPLETED' as const };

    expect(countInbox([inboxTask, scheduledTask, projectTask, completedTask])).toBe(1);
  });

  it('counts today tasks from the supplied global task collection', () => {
    const todayTask = {
      ...task('today'),
      dueAt: new Date().toISOString(),
      scheduledStartAt: null,
    } as ProductivityTask;
    const tomorrowTask = {
      ...todayTask,
      id: 'tomorrow',
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    };

    expect(countToday([todayTask, tomorrowTask])).toBe(1);
  });
});
