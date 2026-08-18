import { UsageSource } from '@prisma/client';
import { InvalidSyncMutationException } from '@core/domain/exceptions';
import { PrismaSyncRepository } from './prisma-sync.repository';
import { PrismaSyncHealth } from './prisma-sync-health';

const summaryPayload = {
  source: 'HEALTH_KIT',
  localDate: '2026-08-10',
  steps: 1200,
  walkingRunningDistanceMeters: 950.5,
  activeEnergyKcal: 310.25,
  exerciseMinutes: 42,
  standHours: 1.5,
  sleepMinutes: 420,
  sleepStart: '2026-08-09T22:00:00.000Z',
  sleepEnd: '2026-08-10T05:00:00.000Z',
  restingHeartRateBpm: 58.5,
  hrvMilliseconds: 42.2,
  workoutCount: 1,
  workoutMinutes: 30,
  workoutEnergyKcal: 180.5,
};

const workoutPayload = {
  source: 'HEALTH_KIT',
  healthKitUUID: 'workout-1',
  activityType: 'RUNNING',
  startedAt: '2026-08-10T06:00:00.000Z',
  endedAt: '2026-08-10T06:30:00.000Z',
  durationSeconds: 1800,
  energyKcal: 180.5,
  sourceBundleId: 'com.apple.Health',
  deviceName: 'Apple Watch',
};

function createTransaction() {
  const syncChangeCreate = jest.fn().mockResolvedValue(undefined);
  const healthSummaryUpsert = jest
    .fn()
    .mockImplementation(async ({ create }: { create: Record<string, unknown> }) => create);
  const healthWorkoutUpsert = jest
    .fn()
    .mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({ id: 'row-1', ...create }));
  const healthWorkoutFindFirst = jest.fn();
  const healthWorkoutDelete = jest.fn().mockResolvedValue(undefined);
  const syncDeviceFindFirst = jest.fn().mockResolvedValue({ id: 'ios-1', userId: 'user-1' });
  const syncDeviceCreate = jest.fn().mockResolvedValue({ id: 'ios-1' });
  const syncDeviceUpdate = jest.fn().mockResolvedValue({ id: 'ios-1' });
  return {
    syncDevice: { findFirst: syncDeviceFindFirst, create: syncDeviceCreate, update: syncDeviceUpdate },
    healthSummary: { upsert: healthSummaryUpsert },
    healthWorkout: { upsert: healthWorkoutUpsert, findFirst: healthWorkoutFindFirst, delete: healthWorkoutDelete },
    syncChange: { create: syncChangeCreate },
    syncDeviceFindFirst,
    syncDeviceCreate,
    syncDeviceUpdate,
    healthSummaryUpsert,
    healthWorkoutUpsert,
    healthWorkoutFindFirst,
    healthWorkoutDelete,
    syncChangeCreate,
  };
}

describe('PrismaSyncHealth', () => {
  it('upserts absolute daily values and records a normalized complete summary', async () => {
    const tx = createTransaction();
    const handler = new PrismaSyncHealth();

    await handler.applyMutation(
      tx as never,
      'user-1',
      {
        id: 'mutation-1',
        kind: 'healthsummary.upsert',
        entityId: '2026-08-10',
        payload: summaryPayload,
        occurredAt: '2026-08-10T07:00:00.000Z',
        serverDeviceId: 'ios-1',
      },
      {},
    );

    expect(tx.healthSummaryUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_source_syncDeviceId_localDate: {
            userId: 'user-1',
            source: UsageSource.HEALTH_KIT,
            syncDeviceId: 'ios-1',
            localDate: new Date('2026-08-10T00:00:00.000Z'),
          },
        },
        update: expect.objectContaining({
          steps: 1200,
          activeEnergyKcal: 310.25,
          standHours: 1.5,
          workoutEnergyKcal: 180.5,
        }),
      }),
    );
    expect(tx.syncChangeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entityType: 'healthsummary', operation: 'UPSERT' }),
      }),
    );
  });

  it('replaces workout values and makes deletion idempotent', async () => {
    const tx = createTransaction();
    tx.healthWorkoutFindFirst
      .mockResolvedValueOnce({
        id: 'row-1',
        syncDeviceId: 'ios-1',
        ...workoutPayload,
        startedAt: new Date(workoutPayload.startedAt),
        endedAt: new Date(workoutPayload.endedAt),
      })
      .mockResolvedValueOnce(null);
    const handler = new PrismaSyncHealth();

    await handler.applyMutation(
      tx as never,
      'user-1',
      {
        id: 'mutation-2',
        kind: 'healthworkout.upsert',
        entityId: 'workout-1',
        payload: { ...workoutPayload, durationSeconds: 2000 },
        occurredAt: '2026-08-10T07:00:00.000Z',
        serverDeviceId: 'ios-1',
      },
      {},
    );
    await handler.applyMutation(
      tx as never,
      'user-1',
      {
        id: 'mutation-3',
        kind: 'healthworkout.delete',
        entityId: 'workout-1',
        payload: { source: 'HEALTH_KIT' },
        occurredAt: '2026-08-10T07:00:00.000Z',
        serverDeviceId: 'ios-1',
      },
      {},
    );
    await handler.applyMutation(
      tx as never,
      'user-1',
      {
        id: 'mutation-4',
        kind: 'healthworkout.delete',
        entityId: 'workout-1',
        payload: { source: 'HEALTH_KIT' },
        occurredAt: '2026-08-10T07:00:00.000Z',
        serverDeviceId: 'ios-1',
      },
      {},
    );

    expect(tx.healthWorkoutUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ durationSeconds: 2000 }),
      }),
    );
    expect(tx.healthWorkoutDelete).toHaveBeenCalledWith({ where: { id: 'row-1' } });
    expect(tx.syncChangeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entityType: 'healthworkout', operation: 'DELETE' }),
      }),
    );
    expect(tx.healthWorkoutDelete).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid values, source, date ordering, and non-owned non-iOS devices', async () => {
    const tx = createTransaction();
    const handler = new PrismaSyncHealth();

    await expect(
      handler.applyMutation(
        tx as never,
        'user-1',
        {
          id: 'mutation-5',
          kind: 'healthsummary.upsert',
          entityId: 'date',
          payload: { ...summaryPayload, steps: -1 },
          occurredAt: '2026-08-10T07:00:00.000Z',
          serverDeviceId: 'ios-1',
        },
        {},
      ),
    ).rejects.toBeInstanceOf(InvalidSyncMutationException);
    await expect(
      handler.applyMutation(
        tx as never,
        'user-1',
        {
          id: 'mutation-6',
          kind: 'healthsummary.upsert',
          entityId: 'date',
          payload: { ...summaryPayload, source: 'BROWSER' },
          occurredAt: '2026-08-10T07:00:00.000Z',
          serverDeviceId: 'ios-1',
        },
        {},
      ),
    ).rejects.toBeInstanceOf(InvalidSyncMutationException);
    await expect(
      handler.applyMutation(
        tx as never,
        'user-1',
        {
          id: 'mutation-7',
          kind: 'healthworkout.upsert',
          entityId: 'workout-1',
          payload: { ...workoutPayload, startedAt: '2026-08-10T07:00:00.000Z', endedAt: '2026-08-10T06:00:00.000Z' },
          occurredAt: '2026-08-10T07:00:00.000Z',
          serverDeviceId: 'ios-1',
        },
        {},
      ),
    ).rejects.toBeInstanceOf(InvalidSyncMutationException);

    // If device is not registered, auto-provisions it
    tx.syncDevice.findFirst.mockResolvedValue(null);
    await expect(
      handler.applyMutation(
        tx as never,
        'user-1',
        {
          id: 'mutation-8',
          kind: 'healthsummary.upsert',
          entityId: 'date',
          payload: summaryPayload,
          occurredAt: '2026-08-10T07:00:00.000Z',
          serverDeviceId: 'ios-1',
        },
        {},
      ),
    ).resolves.toBeNull();
    expect(tx.syncDevice.create).toHaveBeenCalled();

    // If device is registered to another user, rejects
    tx.syncDevice.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'ios-1', userId: 'user-other' });
    await expect(
      handler.applyMutation(
        tx as never,
        'user-2',
        {
          id: 'mutation-9',
          kind: 'healthsummary.upsert',
          entityId: 'date',
          payload: summaryPayload,
          occurredAt: '2026-08-10T07:00:00.000Z',
          serverDeviceId: 'ios-1',
        },
        {},
      ),
    ).rejects.toBeInstanceOf(InvalidSyncMutationException);
  });

  it('hydrates normalized HealthKit summaries and workouts in the initial snapshot', async () => {
    const summary = {
      syncDeviceId: 'ios-1',
      source: UsageSource.HEALTH_KIT,
      localDate: new Date('2026-08-10T00:00:00.000Z'),
      steps: 1200,
      walkingRunningDistanceMeters: 950.5,
      activeEnergyKcal: 310.25,
      exerciseMinutes: 42,
      standHours: null,
      sleepMinutes: 420,
      sleepStart: new Date('2026-08-09T22:00:00.000Z'),
      sleepEnd: new Date('2026-08-10T05:00:00.000Z'),
      restingHeartRateBpm: null,
      hrvMilliseconds: null,
      workoutCount: 1,
      workoutMinutes: 30,
      workoutEnergyKcal: 180.5,
    };
    const workout = {
      id: 'row-1',
      syncDeviceId: 'ios-1',
      source: UsageSource.HEALTH_KIT,
      healthKitUUID: 'workout-1',
      activityType: 'RUNNING',
      startedAt: new Date('2026-08-10T06:00:00.000Z'),
      endedAt: new Date('2026-08-10T06:30:00.000Z'),
      durationSeconds: 1800,
      energyKcal: 180.5,
      sourceBundleId: 'com.apple.Health',
      deviceName: 'Apple Watch',
    };
    const prisma = new Proxy(
      {},
      {
        get: (_target, property: string) => ({
          findMany: jest
            .fn()
            .mockResolvedValue(
              property === 'healthSummary' ? [summary] : property === 'healthWorkout' ? [workout] : [],
            ),
        }),
      },
    );
    const repository = new PrismaSyncRepository(prisma as never, undefined as never);

    const rows = await (
      repository as unknown as { initialSnapshot: (userId: string) => Promise<Array<Record<string, unknown>>> }
    ).initialSnapshot('user-1');

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: 'healthsummary',
          entityId: 'ios-1:2026-08-10',
          data: expect.objectContaining({ source: 'HEALTH_KIT', localDate: '2026-08-10', steps: 1200 }),
        }),
        expect.objectContaining({
          entityType: 'healthworkout',
          entityId: 'ios-1:workout-1',
          data: expect.objectContaining({ source: 'HEALTH_KIT', healthKitUUID: 'workout-1' }),
        }),
      ]),
    );
  });

  it('normalizes empty strings in optional fields to null without throwing', async () => {
    const tx = createTransaction();
    const handler = new PrismaSyncHealth();

    await expect(
      handler.applyMutation(
        tx as never,
        'user-1',
        {
          id: 'mutation-empty-fields',
          kind: 'healthworkout.upsert',
          entityId: 'workout-empty',
          payload: {
            source: 'HEALTH_KIT',
            healthKitUUID: 'workout-uuid-empty',
            activityType: 'RUNNING',
            startedAt: '2026-08-10T06:00:00.000Z',
            endedAt: '2026-08-10T06:30:00.000Z',
            durationSeconds: 1800,
            energyKcal: null,
            sourceBundleId: '   ',
            deviceName: '',
          },
          occurredAt: '2026-08-10T07:00:00.000Z',
          serverDeviceId: 'ios-1',
        },
        {},
      ),
    ).resolves.toBeNull();

    expect(tx.healthWorkoutUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceBundleId: null,
          deviceName: null,
        }),
      }),
    );
  });
});
