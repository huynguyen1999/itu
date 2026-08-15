import { PrismaReminderRepository } from './prisma-scheduled-job.repository';

describe('PrismaScheduledJobRepository habit reminders', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('schedules the next eligible delivery after a reminder fires', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-15T10:00:00.000Z'));
    const habit = {
      id: 'habit-1',
      userId: 'user-1',
      archivedAt: null,
      timezone: 'UTC',
      scheduleType: 'WEEKDAYS',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      restDays: [],
      intervalDays: null,
      timesPerPeriod: null,
      period: null,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: null,
      targetType: 'COUNT',
      targetValue: 1,
      direction: 'BUILD',
    };
    const delivery = {
      id: 'delivery-1',
      localDate: new Date('2026-08-15T00:00:00.000Z'),
      scheduledFor: new Date('2026-08-15T09:00:00.000Z'),
      status: 'SCHEDULED',
      reminder: { id: 'reminder-1', enabled: true, timeLocal: '09:00', habit },
      occurrence: null,
    };
    const tx = {
      habitReminderDelivery: {
        findUnique: jest.fn().mockResolvedValueOnce(delivery).mockResolvedValueOnce(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
      notification: { upsert: jest.fn().mockResolvedValue({}) },
      scheduledJob: { create: jest.fn().mockResolvedValue({}) },
      userPreferences: { findUnique: jest.fn().mockResolvedValue({ habitPreferences: { weekStartDay: 'MONDAY' } }) },
    };
    const repository = new PrismaReminderRepository({
      $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    } as never);

    await expect(repository.deliverHabitReminder(delivery.id)).resolves.toBe(true);

    expect(tx.habitReminderDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reminderId: 'reminder-1',
        localDate: new Date('2026-08-16T00:00:00.000Z'),
        status: 'SCHEDULED',
      }),
    });
    expect(tx.scheduledJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'HABIT_REMINDER',
        payload: expect.objectContaining({ deliveryId: expect.any(String) }),
        runAt: new Date('2026-08-16T09:00:00.000Z'),
      }),
    });
  });

  it('suppresses a delivery when the habit was completed before it fired', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-15T10:00:00.000Z'));
    const habit = {
      id: 'habit-1',
      userId: 'user-1',
      archivedAt: null,
      timezone: 'UTC',
      scheduleType: 'WEEKDAYS',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      restDays: [],
      intervalDays: null,
      timesPerPeriod: null,
      period: null,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: null,
      targetType: 'BOOLEAN',
      targetValue: 1,
      direction: 'BUILD',
    };
    const delivery = {
      id: 'delivery-1',
      localDate: new Date('2026-08-15T00:00:00.000Z'),
      scheduledFor: new Date('2026-08-15T09:00:00.000Z'),
      status: 'SCHEDULED',
      reminder: { id: 'reminder-1', enabled: true, timeLocal: '09:00', habit },
      occurrence: {
        occurrenceDate: new Date('2026-08-15T00:00:00.000Z'),
        status: 'COMPLETED',
        progressLogs: [{ value: 1 }],
      },
    };
    const tx = {
      habitReminderDelivery: {
        findUnique: jest.fn().mockResolvedValueOnce(delivery).mockResolvedValueOnce(null),
        update: jest.fn().mockResolvedValue({ ...delivery, status: 'CANCELED' }),
        create: jest.fn().mockResolvedValue({}),
      },
      notification: { upsert: jest.fn() },
      scheduledJob: { create: jest.fn().mockResolvedValue({}) },
      userPreferences: { findUnique: jest.fn().mockResolvedValue({ habitPreferences: { weekStartDay: 'MONDAY' } }) },
    };
    const repository = new PrismaReminderRepository({
      $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    } as never);

    await expect(repository.deliverHabitReminder(delivery.id)).resolves.toBe(false);

    expect(tx.habitReminderDelivery.update).toHaveBeenCalledWith({
      where: { id: delivery.id },
      data: { status: 'CANCELED' },
    });
    expect(tx.notification.upsert).not.toHaveBeenCalled();
  });

  it('checks the occurrence when the delivery was created before the occurrence', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-15T10:00:00.000Z'));
    const habit = {
      id: 'habit-1',
      userId: 'user-1',
      archivedAt: null,
      timezone: 'UTC',
      scheduleType: 'WEEKDAYS',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      restDays: [],
      intervalDays: null,
      timesPerPeriod: null,
      period: null,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: null,
      targetType: 'BOOLEAN',
      targetValue: 1,
      direction: 'BUILD',
    };
    const delivery = {
      id: 'delivery-1',
      localDate: new Date('2026-08-15T00:00:00.000Z'),
      scheduledFor: new Date('2026-08-15T09:00:00.000Z'),
      status: 'SCHEDULED',
      reminder: { id: 'reminder-1', habitId: 'habit-1', enabled: true, timeLocal: '09:00', habit },
      occurrence: null,
    };
    const tx = {
      habitReminderDelivery: {
        findUnique: jest.fn().mockResolvedValueOnce(delivery).mockResolvedValueOnce(null),
        update: jest.fn().mockResolvedValue({ ...delivery, status: 'CANCELED' }),
        create: jest.fn().mockResolvedValue({}),
      },
      habitOccurrence: {
        findUnique: jest.fn().mockResolvedValue({
          occurrenceDate: new Date('2026-08-15T00:00:00.000Z'),
          status: 'COMPLETED',
          progressLogs: [{ value: 1 }],
        }),
      },
      notification: { upsert: jest.fn() },
      scheduledJob: { create: jest.fn().mockResolvedValue({}) },
      userPreferences: { findUnique: jest.fn().mockResolvedValue({ habitPreferences: { weekStartDay: 'MONDAY' } }) },
    };
    const repository = new PrismaReminderRepository({
      $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    } as never);

    await expect(repository.deliverHabitReminder(delivery.id)).resolves.toBe(false);

    expect(tx.habitOccurrence.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { habitId_occurrenceDate: { habitId: 'habit-1', occurrenceDate: new Date('2026-08-15T00:00:00.000Z') } },
    }));
    expect(tx.notification.upsert).not.toHaveBeenCalled();
  });
});
