import { FocusMode, FocusPhase, HabitDirection, HabitOccurrenceStatus, HabitProgressSource, HabitScheduleType } from '@prisma/client';
import { PrismaProductivityHabits } from './prisma-productivity-habits';
import * as growthAwards from '@core/application/use-cases/growth-awards';
import * as ensureRuleModule from '@core/application/use-cases/ensure-habit-growth-rule';

describe('PrismaProductivityHabits', () => {
  it('preserves an enabled commitment policy on partial REST updates', async () => {
    const previousFlag = process.env.COMMITMENT_FEATURE_ENABLED;
    process.env.COMMITMENT_FEATURE_ENABLED = 'true';
    try {
      const current = {
        id: 'policy-1', userId: 'user-1', habitId: 'habit-1', enabled: true, version: 1,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      };
      const upsert = jest.fn().mockResolvedValue({ ...current, version: 2 });
      const tx = {
        habitCommitmentPolicy: {
          findUnique: jest.fn().mockResolvedValue(current),
          update: jest.fn().mockResolvedValue(current),
          upsert,
        },
      };
      const db = {
        habit: { findFirst: jest.fn().mockResolvedValue({ id: 'habit-1', timezone: 'UTC' }) },
        $transaction: jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx)),
      };
      const repository = new PrismaProductivityHabits(db as never);
      await repository.upsertHabitCommitmentPolicy('user-1', 'habit-1', {
        level: 'GENTLE', expectedAccountXp: 10, graceMinutes: 5, recoveryWindowMinutes: 10,
        effectiveFrom: '2026-01-02T00:00:00.000Z',
      });
      expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ enabled: true }), update: expect.objectContaining({ enabled: true }) }));
    } finally {
      if (previousFlag === undefined) delete process.env.COMMITMENT_FEATURE_ENABLED;
      else process.env.COMMITMENT_FEATURE_ENABLED = previousFlag;
    }
  });

  it('materializes scheduled occurrences before returning a requested range', async () => {
    const habit = {
      id: 'habit-1',
      scheduleType: HabitScheduleType.WEEKDAYS,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      intervalDays: null,
      period: null,
      restDays: [],
      startDate: new Date('2026-08-02T00:00:00.000Z'),
      endDate: null,
      checklistItems: [],
    };
    const occurrence = {
      id: 'occurrence-1',
      habitId: habit.id,
      occurrenceDate: new Date('2026-08-02T00:00:00.000Z'),
      habit,
    };
    const upsert = jest.fn().mockResolvedValue(occurrence);
    const findManyOccurrences = jest.fn().mockResolvedValue([occurrence]);
    const db = {
      habit: { findMany: jest.fn().mockResolvedValue([habit]) },
      habitOccurrence: { findMany: findManyOccurrences },
      $transaction: jest.fn(async (work: (tx: unknown) => Promise<void>) =>
        work({
          habitOccurrence: { upsert },
          habitOccurrenceChecklistItem: { createMany: jest.fn() },
        }),
      ),
    };
    const repository = new PrismaProductivityHabits(db as never);

    const result = await repository.listHabitOccurrences('user-1', {
      from: '2026-08-02',
      to: '2026-08-02',
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          habitId: habit.id,
          occurrenceDate: new Date('2026-08-02T00:00:00.000Z'),
        }),
      }),
    );
    expect(result).toEqual([occurrence]);
  });

  it('validates focus start replay payloads for identical keys', async () => {
    const input = {
      idempotencyKey: 'start-key', taskId: 'task-1', mode: FocusMode.COUNTDOWN,
      phase: FocusPhase.WORK, plannedSeconds: 120,
    };
    const existing = { id: 'focus-1', userId: 'user-1', ...input, startIdempotencyKey: undefined };
    const db = {
      focusSession: { findUnique: jest.fn().mockResolvedValue(existing) },
    };
    const repository = new PrismaProductivityHabits(db as never);

    await expect(repository.createFocusSession('user-1', input)).resolves.toEqual(existing);
    await expect(repository.createFocusSession('user-1', { ...input, plannedSeconds: 240 })).rejects.toThrow(
      'Focus start idempotency key was reused with a different payload',
    );
  });

  it('awards growth activity on habit check-in completion', async () => {
    const habit = {
      id: 'habit-1',
      name: 'Morning Workout',
      direction: HabitDirection.BUILD,
      targetValue: 1,
    };
    const occurrence = {
      id: 'occ-1',
      habitId: habit.id,
      status: HabitOccurrenceStatus.PENDING,
      habit,
    };
    const updatedOccurrence = {
      ...occurrence,
      status: HabitOccurrenceStatus.COMPLETED,
    };

    jest.spyOn(ensureRuleModule, 'ensureHabitGrowthRule').mockResolvedValue(undefined as never);
    jest.spyOn(growthAwards, 'awardGrowthActivityWithReceipt').mockResolvedValue({
      sourceType: 'HABIT' as never,
      sourceId: 'occ-1',
      title: 'Morning Workout',
      receiptKey: 'earned:HABIT:occ-1:lc0',
      progressAwards: [],
      coinAward: { amount: 2, balanceAfter: 10 },
      itemAwards: [],
    });

    const txMock = {
      habitOccurrence: {
        findFirst: jest.fn().mockResolvedValue(occurrence),
        update: jest.fn().mockResolvedValue(updatedOccurrence),
      },
      habitProgressLog: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        aggregate: jest.fn().mockResolvedValue({ _sum: { value: 1 } }),
      },
      habitOccurrenceChecklistItem: {
        count: jest.fn().mockResolvedValue(0),
      },
      syncChange: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const db = {
      $transaction: jest.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
    };

    const repository = new PrismaProductivityHabits(db as never);
    const result = await repository.checkIn('user-1', 'occ-1', { value: 1 });

    expect(ensureRuleModule.ensureHabitGrowthRule).toHaveBeenCalledWith(txMock, 'user-1', 'habit-1');
    expect(growthAwards.awardGrowthActivityWithReceipt).toHaveBeenCalledWith(
      txMock,
      'user-1',
      'HABIT',
      'habit-1',
      'Morning Workout',
      {},
      'occ-1',
    );
    expect(result).toEqual(expect.objectContaining({
      status: HabitOccurrenceStatus.COMPLETED,
      growthReceipt: expect.objectContaining({
        coinAward: { amount: 2, balanceAfter: 10 },
      }),
    }));
  });

  it('replays a keyed completion with the persisted growth receipt', async () => {
    const habit = { id: 'habit-1', name: 'Morning Workout', direction: HabitDirection.BUILD, targetValue: 1 };
    const occurrence = { id: 'occ-1', habitId: habit.id, status: HabitOccurrenceStatus.PENDING, habit };
    const updatedOccurrence = { ...occurrence, status: HabitOccurrenceStatus.COMPLETED };
    const receipt = { sourceType: 'HABIT', sourceId: 'occ-1', title: habit.name, receiptKey: 'earned:HABIT:occ-1:lc0', progressAwards: [], coinAward: { amount: 2, balanceAfter: 10 }, itemAwards: [] };
    let log: any = null;
    const txMock: any = {
      habitOccurrence: { findFirst: jest.fn().mockResolvedValue(occurrence), update: jest.fn().mockResolvedValue(updatedOccurrence) },
      habitProgressLog: {
        findUnique: jest.fn().mockImplementation(async () => log),
        create: jest.fn().mockImplementation(async ({ data }) => { log = { ...data, growthReceipt: null }; return log; }),
        update: jest.fn().mockImplementation(async ({ data }) => { log = { ...log, ...data, growthReceipt: receipt }; return log; }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { value: 1 } }),
      },
      habitOccurrenceChecklistItem: { count: jest.fn().mockResolvedValue(0) },
      syncChange: { create: jest.fn().mockResolvedValue({}) },
    };
    jest.spyOn(ensureRuleModule, 'ensureHabitGrowthRule').mockResolvedValue(undefined as never);
    jest.spyOn(growthAwards, 'awardGrowthActivityWithReceipt').mockResolvedValue(receipt as never);
    const repository = new PrismaProductivityHabits({ $transaction: jest.fn(async (cb: any) => cb(txMock)) } as never);
    const input = { value: 1, idempotencyKey: 'checkin-key' };
    const awardCallsBefore = (growthAwards.awardGrowthActivityWithReceipt as jest.Mock).mock.calls.length;

    const first = await repository.checkIn('user-1', 'occ-1', input);
    const replay = await repository.checkIn('user-1', 'occ-1', input);

    expect(first.growthReceipt).toEqual(receipt);
    expect(replay.growthReceipt).toEqual(receipt);
    expect((growthAwards.awardGrowthActivityWithReceipt as jest.Mock).mock.calls.length - awardCallsBefore).toBe(1);
  });

  it('retries a serializable habit check-in after a P2034 conflict', async () => {
    const occurrence = { id: 'occ-1', habitId: 'habit-1', status: HabitOccurrenceStatus.PENDING, habit: { id: 'habit-1', direction: HabitDirection.BUILD, targetValue: 1 } };
    const tx: any = {
      habitOccurrence: { findFirst: jest.fn().mockResolvedValue(occurrence) },
      habitProgressLog: { findUnique: jest.fn().mockResolvedValue({ occurrenceId: 'occ-1', value: 1, source: HabitProgressSource.MANUAL, sourceEventId: 'retry-key', focusSessionId: null, adjusted: false, note: null, growthReceipt: null }) },
    };
    const transaction = jest.fn().mockRejectedValueOnce({ code: 'P2034' }).mockImplementation(async (cb: any) => cb(tx));
    const repository = new PrismaProductivityHabits({ $transaction: transaction } as never);
    await expect(repository.checkIn('user-1', 'occ-1', { value: 1, idempotencyKey: 'retry-key' })).resolves.toEqual(expect.objectContaining({ id: 'occ-1' }));
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('reverses growth activity on habit occurrence undo action', async () => {
    const habit = {
      id: 'habit-1',
      name: 'Morning Workout',
    };
    const occurrence = {
      id: 'occ-1',
      habitId: habit.id,
      status: HabitOccurrenceStatus.COMPLETED,
      habit,
    };
    const updatedOccurrence = {
      ...occurrence,
      status: HabitOccurrenceStatus.PENDING,
    };

    const reversalReceipt = { sourceType: 'HABIT', sourceId: 'occ-1', title: 'Morning Workout', reversed: true, receiptKey: 'reverted:HABIT:occ-1:lc0', progressAwards: [], accountAward: null, coinAward: null, itemAwards: [] };
    jest.spyOn(growthAwards, 'reverseGrowthActivityWithReceipt').mockResolvedValue(reversalReceipt as never);

    const txMock = {
      habitOccurrence: {
        findFirst: jest.fn().mockResolvedValue(occurrence),
        update: jest.fn().mockResolvedValue(updatedOccurrence),
      },
      habitProgressLog: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      habitCheckIn: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      syncChange: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const db = {
      $transaction: jest.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
    };

    const repository = new PrismaProductivityHabits(db as never);
    const result = await repository.habitOccurrenceAction('user-1', 'occ-1', 'undo');

    expect(growthAwards.reverseGrowthActivityWithReceipt).toHaveBeenCalledWith(
      txMock,
      'user-1',
      'HABIT',
      'occ-1',
      'Morning Workout',
    );
    expect(result).toEqual(expect.objectContaining({
      status: HabitOccurrenceStatus.PENDING,
    }));
  });

  it('replays a keyed undo with its persisted reversal receipt', async () => {
    const habit = { id: 'habit-1', name: 'Morning Workout' };
    const occurrence = { id: 'occ-1', habitId: habit.id, status: HabitOccurrenceStatus.COMPLETED, habit };
    const updatedOccurrence = { ...occurrence, status: HabitOccurrenceStatus.PENDING };
    const reversalReceipt = { sourceType: 'HABIT', sourceId: 'occ-1', title: habit.name, reversed: true, receiptKey: 'reverted:HABIT:occ-1:lc0', progressAwards: [], accountAward: null, coinAward: null, itemAwards: [] };
    let marker: any = null;
    const txMock: any = {
      habitOccurrence: { findFirst: jest.fn().mockResolvedValue(occurrence), update: jest.fn().mockResolvedValue(updatedOccurrence) },
      habitProgressLog: {
        findUnique: jest.fn().mockImplementation(async () => marker),
        create: jest.fn().mockImplementation(async ({ data }) => { marker = { ...data, growthReceipt: null }; return marker; }),
        update: jest.fn().mockImplementation(async ({ data }) => { marker = { ...marker, ...data, growthReceipt: reversalReceipt }; return marker; }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      habitCheckIn: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      syncChange: { create: jest.fn().mockResolvedValue({}) },
    };
    jest.spyOn(growthAwards, 'reverseGrowthActivityWithReceipt').mockResolvedValue(reversalReceipt as never);
    const repository = new PrismaProductivityHabits({ $transaction: jest.fn(async (cb: any) => cb(txMock)) } as never);
    const reverseCallsBefore = (growthAwards.reverseGrowthActivityWithReceipt as jest.Mock).mock.calls.length;

    const first = await repository.habitOccurrenceAction('user-1', 'occ-1', 'undo', 'undo-key');
    const replay = await repository.habitOccurrenceAction('user-1', 'occ-1', 'undo', 'undo-key');

    expect(first.growthReceipt).toEqual(reversalReceipt);
    expect(replay.growthReceipt).toEqual(reversalReceipt);
    expect((growthAwards.reverseGrowthActivityWithReceipt as jest.Mock).mock.calls.length - reverseCallsBefore).toBe(1);
  });

  it('awards focus growth from valid completed minutes and leaves abandoned sessions unrewarded', async () => {
    const startedAt = new Date('2026-08-03T08:00:00.000Z');
    const completedAt = new Date('2026-08-03T09:15:00.000Z');
    const session = {
      id: 'focus-1',
      userId: 'user-1',
      presetId: 'preset-1',
      status: 'ACTIVE',
      startedAt,
      completedAt: null,
      accumulatedPauseSecs: 0,
    };
    const updated = { ...session, status: 'COMPLETED', completedAt };
    const txMock = {
      focusSession: {
        findFirst: jest.fn().mockResolvedValue(session),
        update: jest.fn().mockResolvedValue(updated),
      },
      focusPreset: { findFirst: jest.fn().mockResolvedValue({ id: 'preset-1', name: 'Pomodoro' }) },
    };
    jest.spyOn(growthAwards, 'awardGrowthActivityWithReceipt').mockResolvedValue({
      sourceType: 'FOCUS_PRESET' as never,
      sourceId: 'focus-1',
      title: 'Pomodoro',
      receiptKey: 'earned:FOCUS_PRESET:focus-1:lc0',
      progressAwards: [],
      accountAward: null,
      coinAward: null,
      itemAwards: [],
    });
    const db = { $transaction: jest.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)) };
    const repository = new PrismaProductivityHabits(db as never);

    const result = await repository.adjustFocus('user-1', 'focus-1', undefined, completedAt.toISOString());

    expect(txMock.focusSession.update).toHaveBeenCalledWith({
      where: { id: 'focus-1' },
      data: expect.objectContaining({ adjustedCompletedAt: completedAt, adjustedAt: expect.any(Date) }),
    });
    expect(txMock.focusSession.update.mock.calls[0][0].data).not.toHaveProperty('completedAt');
    expect(growthAwards.awardGrowthActivityWithReceipt).toHaveBeenCalledWith(
      txMock,
      'user-1',
      'FOCUS_PRESET',
      'preset-1',
      'Pomodoro',
      { durationMinutes: 75, focusSessionId: 'focus-1' },
      'focus-1',
      { durationMinutes: 75 },
    );
    expect(result).toEqual(expect.objectContaining({ status: 'COMPLETED', growthReceipt: expect.any(Object) }));
  });

  it('resolves a concurrent focus idempotency unique-key race as a replay', async () => {
    const session = { id: 'focus-1', userId: 'user-1', status: 'PAUSED', version: 3 };
    const event = { payload: { action: 'pause', category: null, note: null, extendSeconds: null, ownerDeviceId: null, reflection: null, taskId: null } };
    const db = {
      $transaction: jest.fn().mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' })),
      focusEvent: { findUnique: jest.fn().mockResolvedValue(event) },
      focusSession: { findFirst: jest.fn().mockResolvedValue(session) },
    };
    const repository = new PrismaProductivityHabits(db as never);

    await expect(repository.focusAction('user-1', 'focus-1', 'pause', { idempotencyKey: 'same-key' })).resolves.toEqual(expect.objectContaining(session));
    expect(db.focusEvent.findUnique).toHaveBeenCalledWith({
      where: { sessionId_idempotencyKey: { sessionId: 'focus-1', idempotencyKey: 'same-key' } },
    });
  });

  it('rejects stale focus adjustments before writing', async () => {
    const session = { id: 'focus-1', userId: 'user-1', version: 4 };
    const update = jest.fn();
    const txMock = { focusSession: { findFirst: jest.fn().mockResolvedValue(session), update }, focusEvent: { findUnique: jest.fn() } };
    const db = { $transaction: jest.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)) };
    const repository = new PrismaProductivityHabits(db as never);

    await expect(repository.adjustFocus('user-1', 'focus-1', '2026-08-03T08:00:00Z', '2026-08-03T09:00:00Z', undefined, 3)).rejects.toThrow(
      'Focus session has changed',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('replays an identical keyed focus adjustment without a second write', async () => {
    const session = { id: 'focus-1', userId: 'user-1', version: 4 };
    const update = jest.fn();
    const txMock = {
      focusSession: { findFirst: jest.fn().mockResolvedValue(session), update },
      focusEvent: {
        findUnique: jest.fn().mockResolvedValue({ payload: { action: 'adjust', startedAt: '2026-08-03T08:00:00Z', completedAt: '2026-08-03T09:00:00Z', taskId: null } }),
      },
    };
    const db = { $transaction: jest.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)) };
    const repository = new PrismaProductivityHabits(db as never);

    await expect(repository.adjustFocus('user-1', 'focus-1', '2026-08-03T08:00:00Z', '2026-08-03T09:00:00Z', undefined, 4, 'same-key')).resolves.toEqual(expect.objectContaining(session));
    expect(update).not.toHaveBeenCalled();
  });
});
