import { PrismaProductivityRepository } from './prisma-productivity.repository';

describe('PrismaProductivityRepository', () => {
  it('lists tasks by created time and creation order descending by default', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new PrismaProductivityRepository(
      {
        task: { findMany },
      } as never,
      {} as never,
    );

    await repository.listTasks('user-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { sortOrder: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('creates a scheduled job and relative reminder from an active task', async () => {
    const scheduledJobCreate = jest.fn().mockResolvedValue({ id: 'job-1' });
    const reminderCreate = jest.fn().mockResolvedValue({ id: 'reminder-1' });
    const db = {
      task: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'task-1', status: 'PLANNED', dueAt: new Date('2026-08-15T14:00:00.000Z'), scheduledStartAt: null,
        }),
      },
      $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback({
        scheduledJob: { create: scheduledJobCreate },
        taskReminder: { create: reminderCreate },
      })),
    };
    const repository = new PrismaProductivityRepository(db as never, {} as never);

    await repository.createReminder('user-1', 'task-1', {
      type: 'RELATIVE', relativeTo: 'DUE_AT', offsetMinutes: -15, persistent: true,
    });

    expect(scheduledJobCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'user-1', type: 'TASK_REMINDER', runAt: new Date('2026-08-15T13:45:00.000Z') }),
    }));
    expect(reminderCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'user-1', taskId: 'task-1', type: 'RELATIVE', relativeTo: 'DUE_AT', offsetMinutes: -15, persistent: true }),
    }));
  });

  it('rejects reminders for completed tasks before creating jobs', async () => {
    const transaction = jest.fn();
    const db = {
      task: { findFirst: jest.fn().mockResolvedValue({ id: 'task-1', status: 'COMPLETED' }) },
      $transaction: transaction,
    };
    const repository = new PrismaProductivityRepository(db as never, {} as never);

    await expect(repository.createReminder('user-1', 'task-1', { remindAt: '2026-08-15T14:00:00.000Z' })).rejects.toThrow(
      'Reminders require an active task',
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('counts only active tasks and adds unassigned tasks to the default Inbox list in listTaskLists', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'inbox-id', title: 'Inbox', isDefault: true, _count: { tasks: 3 } },
      { id: 'work-id', title: 'Work', isDefault: false, _count: { tasks: 5 } },
    ]);
    const count = jest.fn().mockResolvedValue(2);
    const db = {
      taskList: { findMany },
      task: { count },
    };
    const repository = new PrismaProductivityRepository(db as never, {} as never);

    const result = await repository.listTaskLists('user-1', { includeTaskCount: true });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          _count: {
            select: {
              tasks: {
                where: {
                  deletedAt: null,
                  status: { notIn: ['COMPLETED', 'CANCELED', 'ARCHIVED'] },
                },
              },
            },
          },
        },
      }),
    );
    expect(count).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        taskListId: null,
        deletedAt: null,
        status: { notIn: ['COMPLETED', 'CANCELED', 'ARCHIVED'] },
      },
    });
    expect(result).toEqual([
      { id: 'inbox-id', title: 'Inbox', isDefault: true, taskCount: 5 }, // 3 + 2 unassigned
      { id: 'work-id', title: 'Work', isDefault: false, taskCount: 5 },
    ]);
  });

  it('filters inbox view tasks by unassigned/default list and unscheduled/terminal status', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = {
      task: { findMany },
    };
    const repository = new PrismaProductivityRepository(db as never, {} as never);

    await repository.listTasks('user-1', { view: 'inbox' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          deletedAt: null,
          AND: expect.arrayContaining([
            {
              OR: [{ taskListId: null }, { taskList: { isDefault: true } }],
            },
            {
              OR: [
                { status: { in: ['COMPLETED', 'CANCELED'] } },
                { status: 'INBOX', scheduledStartAt: null },
              ],
            },
          ]),
        }),
      }),
    );
  });

  it('completes a matching active focus session when a task is completed through the application path', async () => {
    const completedAt = new Date('2026-08-14T10:00:00.000Z');
    const existingTask = {
      id: 'task-1', userId: 'user-1', version: 1, status: 'INBOX', title: 'Deep work',
      scheduledStartAt: null, scheduledEndAt: null, dueAt: null,
    };
    const updatedTask = { ...existingTask, status: 'COMPLETED', completedAt, version: 2 };
    const focusSession = {
      id: 'focus-1', userId: 'user-1', taskId: 'task-1', phase: 'WORK', status: 'ACTIVE',
      presetId: null, startedAt: new Date('2026-08-14T09:00:00.000Z'), completedAt: null,
      adjustedStartedAt: null, adjustedCompletedAt: null, accumulatedPauseSecs: 0, version: 1,
    };
    const tx = {
      task: {
        findFirst: jest.fn().mockResolvedValue(existingTask),
        update: jest.fn().mockResolvedValue(updatedTask),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updatedTask),
      },
      focusSession: {
        findFirst: jest.fn().mockResolvedValue(focusSession),
        update: jest.fn().mockResolvedValue({ ...focusSession, status: 'COMPLETED', completedAt, version: 2 }),
      },
      focusPreset: { findFirst: jest.fn().mockResolvedValue(null) },
      growthEarningRule: { findUnique: jest.fn().mockResolvedValue(null) },
      syncChange: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const db = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
    const repository = new PrismaProductivityRepository(db as never, {} as never);

    await expect(repository.updateTask('user-1', 'task-1', { status: 'COMPLETED' })).resolves.toEqual(
      expect.objectContaining({ status: 'COMPLETED', growthReceipt: null }),
    );
    expect(tx.focusSession.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'focus-1' } }));
    expect(tx.syncChange.create).toHaveBeenCalledTimes(2);
  });
});
