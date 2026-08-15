import { PrismaSyncBudgetGym } from './prisma-sync-budget-gym';
import { GymWorkoutStatus } from '@prisma/client';
import { InvalidSyncMutationException } from '@core/domain/exceptions';

describe('PrismaSyncBudgetGym', () => {
  it('registers canonical and compatibility mutation names', () => {
    const handler = new PrismaSyncBudgetGym();
    expect(handler.kinds).toEqual(expect.arrayContaining([
      'expense.create',
      'gymworkout.create',
      'workout.update',
      'budgetpreferences.upsert',
      'expensecategory.create',
      'expensecategory.reorder',
      'expensecategory.update',
      'expensecategory.archive',
      'monthlybudget.update',
      'categorybudget.upsert',
      'categorybudget.delete',
      'exercisedefinition.create',
      'exercisedefinition.update',
      'exercisedefinition.delete',
      'exercisedefinition.restore',
      'expense.restore',
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

  it('merges calendar preference patches and emits a sync change', async () => {
    const handler = new PrismaSyncBudgetGym();
    const upsert = jest.fn().mockResolvedValue({ userId: 'u1', calendarPreferences: { zoom: 'DAY' } });
    const tx = {
      userPreferences: {
        findUnique: jest.fn().mockResolvedValue({ userId: 'u1', calendarPreferences: { zoom: 'WEEK' } }),
        upsert,
      },
      syncChange: { create: jest.fn() },
    } as any;

    await handler.applyMutation(tx, 'u1', {
      id: 'm-calendar', kind: 'calendarpreferences.update', entityId: 'u1',
      payload: { preferences: { zoom: 'DAY' } },
    } as any);

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { calendarPreferences: expect.objectContaining({ zoom: 'DAY' }) },
    }));
    expect(tx.syncChange.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: 'calendarpreferences', entityId: 'u1', operation: 'UPSERT' }),
    }));
  });

  it('rejects invalid calendar preference mutations before persistence', async () => {
    const handler = new PrismaSyncBudgetGym();
    const upsert = jest.fn();
    const tx = {
      userPreferences: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert,
      },
      syncChange: { create: jest.fn() },
    } as any;

    await expect(handler.applyMutation(tx, 'u1', {
      id: 'm-invalid-calendar', kind: 'calendarpreferences.update', entityId: 'u1',
      payload: { preferences: { zoom: 'INVALID' } },
    } as any)).rejects.toBeInstanceOf(InvalidSyncMutationException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('restores a budget transaction and emits an upsert change', async () => {
    const handler = new PrismaSyncBudgetGym();
    const tx = {
      expense: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tx-1', userId: 'u1', version: 2 }),
        update: jest.fn().mockResolvedValue({ id: 'tx-1', version: 3 }),
      },
      syncChange: { create: jest.fn() },
    } as any;

    await expect(handler.applyMutation(tx, 'u1', {
      id: 'm-restore', kind: 'expense.restore', entityId: 'tx-1', payload: {},
    } as any)).resolves.toBeNull();
    expect(tx.expense.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deletedAt: null, deletedByDeviceId: null, version: { increment: 1 } }),
    }));
    expect(tx.syncChange.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ operation: 'UPSERT' }) }));
  });

  it('rejects stale budget, gym workout, and exercise restores', async () => {
    const handler = new PrismaSyncBudgetGym();
    const tx = {
      expense: {
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
      id: 'm-stale-budget-restore', kind: 'expense.restore', entityId: 'tx-1', baseVersion: 2, payload: {},
    } as any)).resolves.toMatchObject({ reason: 'STALE_VERSION', entityType: 'expense' });
    await expect(handler.applyMutation(tx, 'u1', {
      id: 'm-stale-workout-restore', kind: 'gymworkout.restore', entityId: 'workout-1', baseVersion: 3, payload: {},
    } as any)).resolves.toMatchObject({ reason: 'STALE_VERSION', entityType: 'gymworkout' });
    await expect(handler.applyMutation(tx, 'u1', {
      id: 'm-stale-exercise-restore', kind: 'exercisedefinition.restore', entityId: 'exercise-1', baseVersion: 4, payload: {},
    } as any)).resolves.toMatchObject({ reason: 'STALE_VERSION', entityType: 'exercisedefinition' });

    expect(tx.expense.update).not.toHaveBeenCalled();
    expect(tx.gymWorkout.update).not.toHaveBeenCalled();
    expect(tx.exerciseDefinition.update).not.toHaveBeenCalled();
  });

  it('rejects cross-account expense IDs and invalid expense dates', async () => {
    const handler = new PrismaSyncBudgetGym();
    const tx = {
      expense: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: 'expense-foreign', userId: 'u2' })
          .mockResolvedValueOnce(null),
        create: jest.fn(),
      },
      expenseCategory: { findFirst: jest.fn().mockResolvedValue({ id: 'food', userId: 'u1' }) },
      syncChange: { create: jest.fn() },
    } as any;

    await expect(handler.applyMutation(tx, 'u1', {
      id: 'm-foreign-expense', kind: 'expense.create', entityId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      payload: { categoryId: 'food', amount: '10.00', expenseDate: '2026-08-15' },
    } as any)).rejects.toThrow('Expense does not belong to user');

    await expect(handler.applyMutation(tx, 'u1', {
      id: 'm-invalid-expense-date', kind: 'expense.create', entityId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
      payload: { categoryId: 'food', amount: '10.00', expenseDate: '2026-02-30' },
    } as any)).rejects.toThrow('expenseDate must be a valid calendar date');
    expect(tx.expense.create).not.toHaveBeenCalled();
  });

  it('rejects invalid budget periods from offline mutations', async () => {
    const handler = new PrismaSyncBudgetGym();
    const tx = {
      monthlyBudget: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      syncChange: { create: jest.fn() },
    } as any;

    await expect(handler.applyMutation(tx, 'u1', {
      id: 'm-invalid-period', kind: 'monthlybudget.update', entityId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      payload: { period: '2026-13', overallLimit: null },
    } as any)).rejects.toThrow('period must be a valid YYYY-MM value');
    expect(tx.monthlyBudget.findFirst).not.toHaveBeenCalled();
  });

  it('rejects negative or non-string money from offline mutations', async () => {
    const handler = new PrismaSyncBudgetGym();
    const tx = {
      expense: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      expenseCategory: { findFirst: jest.fn().mockResolvedValue({ id: 'food', userId: 'u1' }) },
      syncChange: { create: jest.fn() },
    } as any;

    await expect(handler.applyMutation(tx, 'u1', {
      id: 'm-negative-money', kind: 'expense.create', entityId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      payload: { categoryId: 'food', amount: '-1.00', expenseDate: '2026-08-15' },
    } as any)).rejects.toThrow('amount must be a non-negative decimal string');
    await expect(handler.applyMutation(tx, 'u1', {
      id: 'm-number-money', kind: 'expense.create', entityId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
      payload: { categoryId: 'food', amount: 1, expenseDate: '2026-08-15' },
    } as any)).rejects.toThrow('amount must be a non-negative decimal string');
    expect(tx.expense.create).not.toHaveBeenCalled();
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
