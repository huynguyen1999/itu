import { PrismaSyncBudgetGym } from './prisma-sync-budget-gym';
import { GymWorkoutStatus } from '@prisma/client';

describe('PrismaSyncBudgetGym', () => {
  it('registers canonical and compatibility mutation names', () => {
    const handler = new PrismaSyncBudgetGym();
    expect(handler.kinds).toEqual(expect.arrayContaining([
      'budgettransaction.create',
      'gymworkout.create',
      'workout.update',
      'budgetpreferences.upsert',
      'moneycategory.create',
      'moneycategory.reorder',
      'moneycategory.update',
      'moneycategory.delete',
      'moneybudgetperiod.update',
      'moneycategorybudget.upsert',
      'moneycategorybudget.delete',
      'exercisedefinition.create',
      'exercisedefinition.update',
      'exercisedefinition.delete',
      'exercisedefinition.restore',
      'budgettransaction.restore',
      'gymworkout.restore',
      'gymworkout.complete',
      'gymworkout.abandon',
    ]));
  });

  it('merges preference patches with the stored object', async () => {
    const handler = new PrismaSyncBudgetGym();
    const upsert = jest.fn().mockResolvedValue({ userId: 'u1', budgetPreferences: { theme: 'dark', currency: 'VND' } });
    const tx = {
      userPreferences: { findUnique: jest.fn().mockResolvedValue({ userId: 'u1', budgetPreferences: { theme: 'dark' } }), upsert },
      syncChange: { create: jest.fn() },
    } as any;
    await handler.applyMutation(tx, 'u1', { id: 'm1', kind: 'budgetpreferences.upsert', entityId: 'u1', payload: { preferences: { currency: 'VND' } } } as any);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { budgetPreferences: { theme: 'dark', currency: 'VND' } } }));
  });

  it('restores a budget transaction and emits an upsert change', async () => {
    const handler = new PrismaSyncBudgetGym();
    const tx = {
      budgetTransaction: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tx-1', userId: 'u1', version: 2 }),
        update: jest.fn().mockResolvedValue({ id: 'tx-1', version: 3 }),
      },
      syncChange: { create: jest.fn() },
    } as any;

    await expect(handler.applyMutation(tx, 'u1', {
      id: 'm-restore', kind: 'budgettransaction.restore', entityId: 'tx-1', payload: {},
    } as any)).resolves.toBeNull();
    expect(tx.budgetTransaction.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deletedAt: null, deletedByDeviceId: null, version: { increment: 1 } }),
    }));
    expect(tx.syncChange.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ operation: 'UPSERT' }) }));
  });

  it('rejects stale budget, gym workout, and exercise restores', async () => {
    const handler = new PrismaSyncBudgetGym();
    const tx = {
      budgetTransaction: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tx-1', userId: 'u1', version: 3 }),
        update: jest.fn(),
      },
      gymWorkout: {
        findFirst: jest.fn().mockResolvedValue({ id: 'workout-1', userId: 'u1', version: 4 }),
        update: jest.fn(),
      },
      exerciseDefinition: {
        findFirst: jest.fn().mockResolvedValue({ id: 'exercise-1', userId: 'u1', version: 5 }),
        update: jest.fn(),
      },
      syncChange: { create: jest.fn() },
    } as any;

    await expect(handler.applyMutation(tx, 'u1', {
      id: 'm-stale-budget-restore', kind: 'budgettransaction.restore', entityId: 'tx-1', baseVersion: 2, payload: {},
    } as any)).resolves.toMatchObject({ reason: 'STALE_VERSION', entityType: 'budgettransaction' });
    await expect(handler.applyMutation(tx, 'u1', {
      id: 'm-stale-workout-restore', kind: 'gymworkout.restore', entityId: 'workout-1', baseVersion: 3, payload: {},
    } as any)).resolves.toMatchObject({ reason: 'STALE_VERSION', entityType: 'gymworkout' });
    await expect(handler.applyMutation(tx, 'u1', {
      id: 'm-stale-exercise-restore', kind: 'exercisedefinition.restore', entityId: 'exercise-1', baseVersion: 4, payload: {},
    } as any)).resolves.toMatchObject({ reason: 'STALE_VERSION', entityType: 'exercisedefinition' });

    expect(tx.budgetTransaction.update).not.toHaveBeenCalled();
    expect(tx.gymWorkout.update).not.toHaveBeenCalled();
    expect(tx.exerciseDefinition.update).not.toHaveBeenCalled();
  });

  it('merges granular set fields independently and records the winning field clock', async () => {
    const handler = new PrismaSyncBudgetGym();
    const update = jest.fn().mockResolvedValue({ id: 'set-1', version: 3, reps: 12, weight: 80 });
    const tx = {
      gymWorkoutSet: {
        findFirst: jest.fn().mockResolvedValue({ id: 'set-1', version: 2, reps: 10, weight: 80, completedAt: null }),
        update,
      },
      syncFieldClock: {
        findMany: jest.fn().mockResolvedValue([
          { fieldName: 'weight', editedAt: new Date('2026-08-11T10:00:00Z'), deviceId: 'device-b', mutationId: 'old' },
        ]),
        upsert: jest.fn(),
      },
      syncChange: { create: jest.fn() },
    } as any;

    await expect(handler.applyMutation(tx, 'u1', {
      id: 'mut-1', kind: 'workout-set.update', entityId: 'set-1', baseVersion: 1,
      payload: { reps: 12, weight: 100 }, occurredAt: '2026-08-11T09:00:00Z', serverDeviceId: 'device-a',
    } as any)).resolves.toBeNull();

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reps: 12, weight: 80, version: { increment: 1 } }),
    }));
    expect(tx.syncFieldClock.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ fieldName: 'reps', mutationId: 'mut-1' }),
    }));
  });

  it('rejects granular child creates whose parent belongs to another account or is missing', async () => {
    const handler = new PrismaSyncBudgetGym();
    const tx = {
      gymWorkoutExercise: { create: jest.fn() },
      gymWorkout: { findFirst: jest.fn().mockResolvedValue(null) },
      exerciseDefinition: { findFirst: jest.fn() },
      syncChange: { create: jest.fn() },
    } as any;

    await expect(handler.applyMutation(tx, 'u1', {
      id: 'mut-2', kind: 'workout-exercise.create', entityId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      payload: { workoutId: 'workout-1', exerciseId: 'exercise-1' }, occurredAt: '2026-08-11T09:00:00Z',
    } as any)).resolves.toMatchObject({ entityType: 'workout' });
    expect(tx.gymWorkoutExercise.create).not.toHaveBeenCalled();
  });

  it('updates only workout metadata through the canonical field-clock mutation', async () => {
    const handler = new PrismaSyncBudgetGym();
    const update = jest.fn().mockResolvedValue({ id: 'workout-1', title: 'Evening', version: 3 });
    const tx = {
      gymWorkout: {
        findFirst: jest.fn().mockResolvedValue({ id: 'workout-1', userId: 'u1', title: 'Morning', version: 2, deletedAt: null }),
        update,
      },
      syncFieldClock: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
      },
      syncChange: { create: jest.fn() },
    } as any;

    await expect(handler.applyMutation(tx, 'u1', {
      id: 'mut-workout-title',
      kind: 'workout.update',
      entityId: 'workout-1',
      payload: { title: 'Evening' },
      occurredAt: '2026-08-11T09:00:00Z',
      serverDeviceId: 'device-a',
    } as any)).resolves.toBeNull();

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'workout-1' },
      data: { title: 'Evening', version: { increment: 1 } },
    }));
    expect(tx.syncFieldClock.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ entityType: 'workout', entityId: 'workout-1', fieldName: 'title' }),
    }));
    expect(tx.gymWorkoutExercise).toBeUndefined();
  });

  it('persists duration minutes when finishing a workout', async () => {
    const handler = new PrismaSyncBudgetGym();
    const update = jest.fn().mockResolvedValue({ id: 'workout-1', version: 3, status: 'COMPLETED' });
    const tx = {
      gymWorkout: {
        findFirst: jest.fn().mockResolvedValue({ id: 'workout-1', userId: 'u1', version: 2, deletedAt: null, durationMinutes: null }),
        update,
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'workout-1', userId: 'u1', version: 3, status: 'COMPLETED', exercises: [] }),
      },
      gymWorkoutSet: { updateMany: jest.fn() },
      gymWorkoutExercise: { updateMany: jest.fn() },
      syncChange: { create: jest.fn() },
    } as any;

    await expect(handler.applyMutation(tx, 'u1', {
      id: 'mut-workout-finish',
      kind: 'workout.finish',
      entityId: 'workout-1',
      baseVersion: 2,
      payload: { durationMinutes: 42, endedAt: '2026-08-11T09:42:00Z' },
      occurredAt: '2026-08-11T09:00:00Z',
    } as any)).resolves.toBeNull();

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ durationMinutes: 42, status: GymWorkoutStatus.COMPLETED }),
    }));
  });

  it('rejects completed workout creation', async () => {
    const handler = new PrismaSyncBudgetGym();
    const tx = {
      gymWorkout: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      syncChange: { create: jest.fn() },
    } as any;

    await expect(handler.applyMutation(tx, 'u1', {
      id: 'mut-workout-create-completed',
      kind: 'workout.create',
      entityId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      payload: { title: 'Imported', status: 'COMPLETED' },
      occurredAt: '2026-08-11T09:00:00Z',
    } as any)).rejects.toThrow('Workouts must be finished after creation');
    expect(tx.gymWorkout.create).not.toHaveBeenCalled();
  });

  it('rejects status changes through generic workout updates', async () => {
    const handler = new PrismaSyncBudgetGym();
    const tx = {
      gymWorkout: {
        findFirst: jest.fn().mockResolvedValue({ id: 'workout-1', userId: 'u1', version: 1, deletedAt: null }),
        update: jest.fn(),
      },
      syncChange: { create: jest.fn() },
    } as any;

    await expect(handler.applyMutation(tx, 'u1', {
      id: 'mut-workout-status',
      kind: 'workout.update',
      entityId: 'workout-1',
      payload: { status: 'COMPLETED' },
    } as any)).rejects.toThrow('Workout status changes must use the workout lifecycle');
    expect(tx.gymWorkout.update).not.toHaveBeenCalled();
  });
});
