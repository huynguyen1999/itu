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
});
