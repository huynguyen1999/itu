import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, type OfflineMutationInput } from './client';
import type { FocusSession } from './types';

function offlineClient() {
  const client = new ApiClient();
  const mutations: OfflineMutationInput<unknown>[] = [];
  client.setOfflineMutationHandler(async <T>(input: OfflineMutationInput<T>) => {
    mutations.push(input as OfflineMutationInput<unknown>);
    return input.optimistic;
  });
  return { client, mutations };
}

const focus: FocusSession = {
  id: '01K00000000000000000000000',
  mode: 'COUNTDOWN',
  phase: 'WORK',
  status: 'ACTIVE',
  plannedSeconds: 1500,
  accumulatedPauseSecs: 0,
  cycle: 1,
  tagNamesSnapshot: [],
  startedAt: '2026-07-28T00:00:00.000Z',
  version: 1,
};

afterEach(() => vi.unstubAllGlobals());

describe('offline-first productivity mutations', () => {
  it('queues task ordering as a single batch reorder mutation', async () => {
    const { client, mutations } = offlineClient();

    await client.reorderTasks(['task-1', 'task-2']);

    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({
      kind: 'task.reorder',
      payload: { taskIds: ['task-1', 'task-2'] },
    });
  });

  it('marks task status changes for immediate synchronization', async () => {
    const { client, mutations } = offlineClient();

    await client.updateTask('task-1', { status: 'COMPLETED', version: 2 });

    expect(mutations[0]).toMatchObject({
      kind: 'task.update',
      entityId: 'task-1',
      payload: { status: 'COMPLETED' },
      baseVersion: 2,
      immediate: true,
    });
  });

  it('queues calendar schedule moves, resizes, and due writes through offline mutations', async () => {
    const { client, mutations } = offlineClient();

    await client.updateTask('scheduled-task', {
      scheduledStartAt: '2026-08-12T09:00:00.000Z',
      scheduledEndAt: '2026-08-12T10:30:00.000Z',
      version: 4,
    });
    await client.updateTask('due-task', { dueAt: '2026-08-13T21:30:00.000Z', version: 5 });

    expect(mutations).toEqual([
      expect.objectContaining({
        kind: 'task.update',
        entityId: 'scheduled-task',
        baseVersion: 4,
        payload: {
          scheduledStartAt: '2026-08-12T09:00:00.000Z',
          scheduledEndAt: '2026-08-12T10:30:00.000Z',
        },
      }),
      expect.objectContaining({
        kind: 'task.update',
        entityId: 'due-task',
        baseVersion: 5,
        payload: { dueAt: '2026-08-13T21:30:00.000Z' },
      }),
    ]);
  });

  it('queues calendar visibility, completion, and collapsed-group preferences offline', async () => {
    const { client, mutations } = offlineClient();

    await client.updateCalendarPreferences({
      zoom: 'MONTH',
      visibleKinds: ['TASK_DURATION', 'TASK_DUE'],
      showCompleted: false,
      collapsedGroupIds: ['project:inbox'],
    });

    expect(mutations[0]).toMatchObject({
      kind: 'calendarpreferences.update',
      entityId: 'calendar',
      payload: {
        zoom: 'MONTH',
        visibleKinds: ['TASK_DURATION', 'TASK_DUE'],
        showCompleted: false,
        collapsedGroupIds: ['project:inbox'],
      },
    });
  });

  it('queues focus actions and returns the local state immediately', async () => {
    const { client, mutations } = offlineClient();

    const updated = await client.focusAction(
      focus.id,
      'pause',
      { idempotencyKey: 'focus-pause', expectedVersion: 1 },
      focus,
    );

    expect(updated).toMatchObject({ status: 'PAUSED', version: 2 });
    expect(mutations[0]).toMatchObject({
      kind: 'focussession.action',
      entityId: focus.id,
      baseVersion: 1,
      immediate: true,
      payload: { idempotencyKey: 'focus-pause', expectedVersion: 1 },
    });
  });

  it('preserves focus-adjust concurrency fields in the queued payload', async () => {
    const { client, mutations } = offlineClient();

    await client.adjustFocus(
      focus.id,
      {
        startedAt: '2026-07-28T00:01:00.000Z',
        completedAt: '2026-07-28T00:20:00.000Z',
        taskId: null,
        idempotencyKey: 'focus-adjust',
        expectedVersion: 1,
      },
      focus,
    );

    expect(mutations[0]).toMatchObject({
      kind: 'focussession.adjust',
      baseVersion: 1,
      payload: {
        idempotencyKey: 'focus-adjust',
        expectedVersion: 1,
      },
    });
  });

  it('sends focus-adjust concurrency fields in the direct PATCH body', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(focus), { status: 200, headers: { 'Content-Type': 'application/json' } }),
        ),
    );
    const client = new ApiClient();
    await client.adjustFocus(
      focus.id,
      {
        startedAt: focus.startedAt,
        completedAt: '2026-07-28T00:20:00.000Z',
        taskId: null,
        idempotencyKey: 'focus-adjust-http',
        expectedVersion: 1,
      },
      focus,
    );
    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      idempotencyKey: 'focus-adjust-http',
      expectedVersion: 1,
    });
  });

  it('preserves a study review idempotency key in offline payloads', async () => {
    const { client, mutations } = offlineClient();
    await client.submitReview('session-1', {
      cardId: 'card-1',
      direction: 'FRONT_TO_BACK',
      grade: 'GOOD',
      idempotencyKey: 'review-1',
    });
    expect(mutations[0]).toMatchObject({
      kind: 'review.create',
      payload: { sessionId: 'session-1', idempotencyKey: 'review-1' },
    });
  });

  it('sends a study review idempotency key in the direct HTTP body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })),
    );
    const client = new ApiClient();
    await client.submitReview('session-1', {
      cardId: 'card-1',
      direction: 'FRONT_TO_BACK',
      grade: 'GOOD',
      idempotencyKey: 'review-http-1',
    });
    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({ idempotencyKey: 'review-http-1' });
  });

  it('keeps a partial habit target (1/5) pending while queuing occurrence operations', async () => {
    const { client, mutations } = offlineClient();

    await client.updateHabit('habit-1', { name: 'Read', version: 3 });
    const checkIn = await client.checkInHabit('occurrence-1', { value: 1, idempotencyKey: 'habit-checkin' });
    await client.habitOccurrenceAction('occurrence-1', 'undo', 'habit-undo');
    await client.setHabitChecklistItem('occurrence-1', 'item-1', true);

    expect(mutations.map(({ kind }) => kind)).toEqual([
      'habit.update',
      'habitoccurrence.checkin',
      'habitoccurrence.action',
      'habitoccurrence.checklist',
    ]);
    expect(mutations[0]).toMatchObject({ baseVersion: 3 });
    expect(mutations.slice(1).every(({ immediate }) => immediate)).toBe(true);
    expect(mutations[1]).toMatchObject({ payload: { idempotencyKey: 'habit-checkin' } });
    expect(mutations[2]).toMatchObject({ payload: { action: 'undo', idempotencyKey: 'habit-undo' } });
    expect(checkIn).toMatchObject({ status: 'PENDING' });
  });
});
