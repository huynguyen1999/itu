import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ProductivityTask } from '@/shared/api/types';
import type { ClientSyncMutation } from '@/shared/sync/syncQueue';
import {
  handleTaskStatusClick,
  groupedGrowthRewardChips,
  IDLE_TASK_SYNC_PRESENTATION,
  pendingMutationsWithoutConflicts,
  retryTaskMutationsInOrder,
  TaskItem,
  taskSyncPresentation,
  type GrowthRewardChipModel,
} from './TaskItem';

const task: ProductivityTask = {
  id: 'task-1',
  title: 'Explore the task details page',
  descriptionMarkdown: 'Review the redesigned task card.',
  priority: 'MEDIUM',
  important: true,
  urgent: true,
  urgencyReason: 'Due soon',
  dueAt: '2026-07-30T18:00:00.000Z',
  status: 'PLANNED',
  sortOrder: 1,
  version: 1,
  tags: [],
  reminders: [],
  children: [],
};

const mutation = (id: string, overrides: Partial<ClientSyncMutation> = {}): ClientSyncMutation => ({
  id,
  kind: 'task.update',
  entityId: task.id,
  payload: { title: task.title },
  occurredAt: '2026-07-30T07:00:00.000Z',
  ...overrides,
});

describe('task sync presentation', () => {
  it('ignores mutations for other entities', () => {
    expect(taskSyncPresentation(task.id, [mutation('other', { entityId: 'task-2' })], { phase: 'pending' })).toEqual(
      IDLE_TASK_SYNC_PRESENTATION,
    );
  });

  it('shows offline pending work as waiting to sync', () => {
    expect(taskSyncPresentation(task.id, [mutation('pending')], { phase: 'offline' })).toEqual({
      kind: 'offline',
      label: 'Waiting to sync',
      retryMutationIds: [],
    });
  });

  it('prioritizes failures and preserves retry order', () => {
    const result = taskSyncPresentation(
      task.id,
      [
        mutation('newer', {
          occurredAt: '2026-07-30T07:02:00.000Z',
          lastErrorCode: 'SERVER',
        }),
        mutation('pending', { occurredAt: '2026-07-30T07:01:00.000Z' }),
        mutation('older', {
          occurredAt: '2026-07-30T07:00:00.000Z',
          attemptCount: 1,
        }),
      ],
      { phase: 'pending' },
    );

    expect(result).toEqual({
      kind: 'failed',
      label: 'Couldn’t sync',
      retryMutationIds: ['older', 'newer'],
    });
  });

  it('leaves semantic conflicts to the reconciliation interface', () => {
    const pending = [mutation('conflict'), mutation('visible')];
    expect(pendingMutationsWithoutConflicts(pending, [{ mutationId: 'conflict' }]).map((item) => item.id)).toEqual([
      'visible',
    ]);
  });

  it('retries task mutations sequentially', async () => {
    const calls: string[] = [];
    await retryTaskMutationsInOrder(['older', 'newer'], async (mutationId) => {
      calls.push(mutationId);
    });
    expect(calls).toEqual(['older', 'newer']);
  });
});

describe('TaskItem', () => {
  const renderTask = (overrides: Partial<React.ComponentProps<typeof TaskItem>> = {}) => {
    const growthChips: GrowthRewardChipModel[] = [{ kind: 'progress', key: 'xp', xpReward: 100, awards: [] }];

    return renderToStaticMarkup(
      <TaskItem
        task={task}
        density="standard"
        compact
        selected={false}
        showDetails
        showTaskList
        growthChips={growthChips}
        syncPresentation={IDLE_TASK_SYNC_PRESENTATION}
        draggable={false}
        dropEdge={null}
        onSelect={vi.fn()}
        onStatusChange={vi.fn()}
        onRetrySync={vi.fn().mockResolvedValue(undefined)}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDragLeave={vi.fn()}
        onDrop={vi.fn()}
        onDragEnd={vi.fn()}
        {...overrides}
      />,
    );
  };

  it('renders the reference hierarchy for priority, due date, XP, and selection', () => {
    const markup = renderTask({
      selected: true,
      task: {
        ...task,
        dueAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      },
    });

    expect(markup).toContain('priority-medium');
    expect(markup).toContain('density-standard');
    expect(markup).toContain('is-selected');
    expect(markup).toContain('itu-task-item__headline');
    expect(markup).toContain('medium');
    expect(markup).toMatch(/Due today|Overdue/);
    expect(markup).toContain('+100 Skill XP');
  });

  it('shows account XP separately from allocated skill XP and weights', () => {
    const chips = groupedGrowthRewardChips({
      accountXp: 50,
      coinReward: 0,
      enabled: true,
      id: 'rule-1',
      itemAwards: [],
      maxRewardCap: null,
      scalingMode: 'FIXED',
      skillAwards: [
        { skillId: 'skill-b', xpReward: 30, skill: { name: 'B' } },
        { skillId: 'skill-a', xpReward: 70, skill: { name: 'A' } },
      ],
      sourceId: 'task-1',
      sourceType: 'TASK',
      version: 1,
    } as never);

    expect(chips[0]).toMatchObject({ kind: 'account', accountXp: 50 });
    expect(chips.filter((chip) => chip.kind === 'progress').map((chip) => chip.xpReward)).toEqual([35, 15]);
    const markup = renderToStaticMarkup(
      <TaskItem
        task={task}
        density="standard"
        compact
        selected={false}
        showDetails
        showTaskList
        growthChips={chips}
        syncPresentation={IDLE_TASK_SYNC_PRESENTATION}
        draggable={false}
        dropEdge={null}
        onSelect={vi.fn()}
        onStatusChange={vi.fn()}
        onRetrySync={vi.fn().mockResolvedValue(undefined)}
        onDragStart={vi.fn()}
        onDragOver={vi.fn()}
        onDragLeave={vi.fn()}
        onDrop={vi.fn()}
        onDragEnd={vi.fn()}
      />,
    );
    expect(markup).toContain('+50 Account XP');
    expect(markup).toContain('+35 Skill XP');
    expect(markup).toContain('+15 Skill XP');
    expect(markup).toContain('70% weight');
    expect(markup).toContain('30% weight');
    expect(markup).not.toContain('+70 Skill XP');
    expect(markup).not.toContain('+30 Skill XP');
  });

  it('renders completed and Matrix variants through the same component', () => {
    const markup = renderTask({
      task: { ...task, status: 'COMPLETED', dueAt: '2026-07-27T12:00:00.000Z' },
      density: 'matrix',
    });

    expect(markup).toContain('is-done');
    expect(markup).toContain('density-matrix');
    expect(markup).toContain('27 Jul');
    expect(markup).not.toContain('Overdue');
  });

  it('uses only the animated status icon to communicate an in-progress task', () => {
    const markup = renderTask({ task: { ...task, status: 'IN_PROGRESS' } });

    expect(markup).toContain('is-in-progress');
    expect(markup).not.toContain('>In progress<');
  });

  it('shows the task list inline unless the caller hides it for list grouping', () => {
    const listedTask = {
      ...task,
      taskList: { id: 'list-1', title: 'Personal', color: '#167f71', isDefault: false, version: 1 },
    };

    expect(renderTask({ task: listedTask })).toContain('Personal');
    expect(renderTask({ task: listedTask, showTaskList: false })).not.toContain('Personal');
  });

  it('keeps pending task updates out of the row while global sync is active', () => {
    const markup = renderTask({
      syncPresentation: {
        kind: 'pending',
        retryMutationIds: [],
      },
    });

    expect(markup).not.toContain('Saving');
  });

  it('renders failed sync feedback and Retry', () => {
    const markup = renderTask({
      syncPresentation: {
        kind: 'failed',
        label: 'Couldn’t sync',
        retryMutationIds: ['older', 'newer'],
      },
    });

    expect(markup).toContain('state-failed');
    expect(markup).toContain('Couldn’t sync');
    expect(markup).toContain('Retry');
  });

  it('stops row selection before changing status', () => {
    const stopPropagation = vi.fn();
    const onStatusChange = vi.fn();

    handleTaskStatusClick({ stopPropagation }, onStatusChange);

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(onStatusChange).toHaveBeenCalledOnce();
  });

  it('renders "Due today" for tasks due on the current day', () => {
    const todayAt18 = new Date();
    todayAt18.setHours(18, 0, 0, 0);
    const markup = renderTask({
      task: {
        ...task,
        dueAt: todayAt18.toISOString(),
      },
    });

    expect(markup).toContain('Due today');
    expect(markup).not.toContain('1 Day Left');
  });

  it('does not mark a task due earlier today as overdue', () => {
    const todayAtMidnight = new Date();
    todayAtMidnight.setHours(0, 0, 0, 0);
    const markup = renderTask({
      task: {
        ...task,
        dueAt: todayAtMidnight.toISOString(),
      },
    });

    expect(markup).toContain('Due today');
    expect(markup).not.toContain('is-urgent');
  });

  it('renders "1 Day Left" for tasks due tomorrow', () => {
    const tomorrowAt18 = new Date();
    tomorrowAt18.setDate(tomorrowAt18.getDate() + 1);
    tomorrowAt18.setHours(18, 0, 0, 0);
    const markup = renderTask({
      task: {
        ...task,
        dueAt: tomorrowAt18.toISOString(),
      },
    });

    expect(markup).toContain('1 Day Left');
    expect(markup).not.toContain('Due today');
  });
});
