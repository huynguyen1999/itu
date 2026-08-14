import { PrismaSyncTasks } from './prisma-sync-tasks';
import { SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import { InvalidSyncMutationException } from '@core/domain/exceptions';

const SERVER_START = new Date('2026-08-10T09:00:00.000Z');
const SERVER_END = new Date('2026-08-10T10:00:00.000Z');

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    userId: 'u1',
    version: 2,
    title: 'Original title',
    descriptionMarkdown: '',
    taskListId: 'list-1',
    sectionId: null,
    parentId: null,
    priority: 'NONE',
    important: false,
    urgentOverride: null,
    status: 'INBOX',
    dueAt: null,
    scheduledStartAt: SERVER_START,
    scheduledEndAt: SERVER_END,
    estimatedMinutes: null,
    recurrenceRule: null,
    completedAt: null,
    sortOrder: 0,
    tags: [],
    ...overrides,
  };
}

function scheduleMutation(overrides: Record<string, unknown> = {}): SyncMutation {
  return {
    id: 'm-schedule',
    kind: 'task.update',
    entityId: 'task-1',
    baseVersion: 1,
    payload: {
      scheduledStartAt: '2026-08-11T13:00:00.000Z',
      scheduledEndAt: '2026-08-11T15:00:00.000Z',
    },
    occurredAt: '2026-08-10T10:00:05.000Z',
    fieldEditedAt: {
      scheduledStartAt: '2026-08-10T10:00:05.000Z',
      scheduledEndAt: '2026-08-10T10:00:05.000Z',
    },
    ...overrides,
  } as SyncMutation;
}

function makeTx(task: Record<string, unknown>, clocks: unknown[] = []) {
  const updated = { ...task, version: (task.version as number) + 1 };
  return {
    task: {
      findFirst: jest.fn().mockResolvedValue(task),
      update: jest.fn().mockResolvedValue(updated),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...updated, tags: [] }),
    },
    focusSession: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    focusPreset: { findFirst: jest.fn().mockResolvedValue(null) },
    growthEarningRule: { findUnique: jest.fn().mockResolvedValue(null) },
    syncFieldClock: {
      findMany: jest.fn().mockResolvedValue(clocks),
      upsert: jest.fn().mockResolvedValue({}),
    },
    syncChange: { create: jest.fn().mockResolvedValue({}) },
    taskReminder: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
}

const clock = (fieldName: string, editedAt: string, deviceId = 'device-a', mutationId = 'mut-a') => ({
  fieldName,
  editedAt: new Date(editedAt),
  deviceId,
  mutationId,
});

describe('PrismaSyncTasks task.update schedule reconciliation', () => {
  const handler = new PrismaSyncTasks();

  it('newer schedule edit wins via field clocks without a manual conflict', async () => {
    const tx = makeTx(taskRow(), [
      clock('scheduledStartAt', '2026-08-10T10:00:01.000Z'),
      clock('scheduledEndAt', '2026-08-10T10:00:01.000Z'),
    ]);
    const outcome = {};
    const result = await handler.applyMutation(
      tx,
      'u1',
      { ...scheduleMutation(), serverDeviceId: 'device-b' },
      outcome,
    );
    expect(result).toBeNull();
    const data = tx.task.update.mock.calls[0][0].data;
    expect(data.scheduledStartAt).toEqual(new Date('2026-08-11T13:00:00.000Z'));
    expect(data.scheduledEndAt).toEqual(new Date('2026-08-11T15:00:00.000Z'));
    const upserts = tx.syncFieldClock.upsert.mock.calls.map((call: any[]) => call[0]);
    expect(upserts).toHaveLength(2);
    for (const upsert of upserts) {
      expect(upsert.update.editedAt).toEqual(new Date('2026-08-10T10:00:05.000Z'));
      expect(upsert.update.deviceId).toBe('device-b');
    }
  });

  it('older schedule edit keeps server values and does not advance clocks', async () => {
    const tx = makeTx(taskRow(), [
      clock('scheduledStartAt', '2026-08-10T10:00:05.000Z', 'device-a'),
      clock('scheduledEndAt', '2026-08-10T10:00:05.000Z', 'device-a'),
    ]);
    const result = await handler.applyMutation(
      tx,
      'u1',
      {
        ...scheduleMutation({ occurredAt: '2026-08-10T10:00:01.000Z' }),
        fieldEditedAt: {
          scheduledStartAt: '2026-08-10T10:00:01.000Z',
          scheduledEndAt: '2026-08-10T10:00:01.000Z',
        },
        serverDeviceId: 'device-b',
      },
      {},
    );
    expect(result).toBeNull();
    const data = tx.task.update.mock.calls[0][0].data;
    expect(data.scheduledStartAt).toEqual(SERVER_START);
    expect(data.scheduledEndAt).toEqual(SERVER_END);
    expect(tx.syncFieldClock.upsert).not.toHaveBeenCalled();
  });

  it('merges non-overlapping title and schedule edits from a stale base', async () => {
    const tx = makeTx(taskRow(), [
      clock('scheduledStartAt', '2026-08-10T10:00:01.000Z', 'device-a'),
      clock('scheduledEndAt', '2026-08-10T10:00:01.000Z', 'device-a'),
    ]);
    const mutation = scheduleMutation({
      baseValues: { title: 'Original title', scheduledStartAt: null, scheduledEndAt: null },
      payload: {
        title: 'Client title',
        scheduledStartAt: '2026-08-11T13:00:00.000Z',
        scheduledEndAt: '2026-08-11T15:00:00.000Z',
      },
    });
    const result = await handler.applyMutation(tx, 'u1', { ...mutation, serverDeviceId: 'device-b' }, {});
    expect(result).toBeNull();
    const data = tx.task.update.mock.calls[0][0].data;
    expect(data.title).toBe('Client title');
    expect(data.scheduledStartAt).toEqual(new Date('2026-08-11T13:00:00.000Z'));
    expect(data.scheduledEndAt).toEqual(new Date('2026-08-11T15:00:00.000Z'));
  });

  it('keeps COMPLETED status while applying a newer schedule edit', async () => {
    const completed = taskRow({ status: 'COMPLETED', completedAt: new Date('2026-08-10T08:00:00.000Z') });
    const tx = makeTx(completed, [
      clock('scheduledStartAt', '2026-08-10T10:00:01.000Z'),
      clock('scheduledEndAt', '2026-08-10T10:00:01.000Z'),
    ]);
    const result = await handler.applyMutation(tx, 'u1', { ...scheduleMutation(), serverDeviceId: 'device-b' }, {});
    expect(result).toBeNull();
    const data = tx.task.update.mock.calls[0][0].data;
    expect(data.status).toBe('COMPLETED');
    expect(data.scheduledStartAt).toEqual(new Date('2026-08-11T13:00:00.000Z'));
  });

  it('rejects a duration pair whose edit timestamps differ', async () => {
    const tx = makeTx(taskRow());
    const mutation = scheduleMutation({
      fieldEditedAt: {
        scheduledStartAt: '2026-08-10T10:00:05.000Z',
        scheduledEndAt: '2026-08-10T10:00:07.000Z',
      },
    });
    await expect(handler.applyMutation(tx, 'u1', mutation, {})).rejects.toBeInstanceOf(InvalidSyncMutationException);
    expect(tx.task.update).not.toHaveBeenCalled();
  });

  it('never persists a mixed new-start/old-end interval', async () => {
    const tx = makeTx(taskRow(), [
      clock('scheduledStartAt', '2026-08-10T10:00:01.000Z'),
      clock('scheduledEndAt', '2026-08-10T10:00:01.000Z'),
    ]);
    const mutation = scheduleMutation({
      payload: { scheduledStartAt: '2026-08-11T13:00:00.000Z' },
      fieldEditedAt: { scheduledStartAt: '2026-08-10T10:00:05.000Z' },
    });
    await expect(handler.applyMutation(tx, 'u1', mutation, {})).rejects.toThrow(
      'Scheduled start must be before scheduled end',
    );
    expect(tx.task.update).not.toHaveBeenCalled();
  });

  it('keeps legacy conflict behavior for schedule edits without fieldEditedAt', async () => {
    const tx = makeTx(taskRow());
    const mutation = scheduleMutation({
      baseValues: { scheduledStartAt: null, scheduledEndAt: null },
      fieldEditedAt: undefined,
    });
    const result = await handler.applyMutation(tx, 'u1', mutation, {});
    expect(result?.reason).toBe('STALE_VERSION');
    expect(result?.conflictingFields).toEqual(
      expect.arrayContaining(['scheduledStartAt', 'scheduledEndAt']),
    );
    expect(tx.task.update).not.toHaveBeenCalled();
  });
});

describe('PrismaSyncTasks task completion invariant', () => {
  it('completes the matching active WORK focus session in the same mutation transaction', async () => {
    const completedAt = new Date('2026-08-14T10:00:00.000Z');
    const tx = makeTx(taskRow());
    tx.task.update.mockResolvedValue({
      ...taskRow({ status: 'COMPLETED', completedAt }),
      version: 3,
    });
    tx.focusSession.findFirst.mockResolvedValue({
      id: 'focus-1',
      userId: 'u1',
      taskId: 'task-1',
      phase: 'WORK',
      status: 'ACTIVE',
      presetId: null,
    });
    tx.focusSession.update.mockResolvedValue({
      id: 'focus-1',
      userId: 'u1',
      taskId: 'task-1',
      phase: 'WORK',
      status: 'COMPLETED',
      presetId: null,
      completedAt,
      version: 4,
    });

    const result = await new PrismaSyncTasks().applyMutation(
      tx,
      'u1',
      {
        id: 'complete-task-1',
        kind: 'task.update',
        entityId: 'task-1',
        payload: { status: 'COMPLETED' },
        occurredAt: completedAt.toISOString(),
      },
      {},
    );

    expect(result).toBeNull();
    expect(tx.focusSession.update).toHaveBeenCalledWith({
      where: { id: 'focus-1' },
      data: { status: 'COMPLETED', completedAt, version: { increment: 1 } },
    });
    expect(tx.syncChange.create).toHaveBeenCalledTimes(2);
  });
});
