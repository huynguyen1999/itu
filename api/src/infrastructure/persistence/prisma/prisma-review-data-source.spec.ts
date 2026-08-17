import { PrismaReviewDataSource } from './prisma-review-data-source';

const period = {
  startDate: '2026-08-13',
  endDate: '2026-08-13',
  timezone: 'Asia/Ho_Chi_Minh',
  startInclusive: '2026-08-12T17:00:00.000Z',
  endExclusive: '2026-08-13T17:00:00.000Z',
} as const;

function prismaMock() {
  const empty = () => jest.fn().mockResolvedValue([]);
  return {
    task: { findMany: empty() },
    focusSession: { findMany: empty(), count: jest.fn().mockResolvedValue(0) },
    reviewLog: { findMany: empty() },
    habitOccurrence: { findMany: empty() },
    journalEntry: { findMany: empty() },
    gymWorkout: { findMany: empty() },
    expense: { findMany: empty() },
    usageSummary: { findMany: empty() },
    websiteActivitySession: { findMany: empty() },
    websiteUsageSummary: { findMany: empty() },
    healthSummary: { findMany: empty() },
    healthWorkout: { findMany: empty() },
  };
}

describe('PrismaReviewDataSource', () => {
  it('aggregates source/device/hour usage without double-counting identities and keeps nullable counters', async () => {
    const prisma = prismaMock();
    prisma.usageSummary.findMany.mockResolvedValue([
      {
        localDate: new Date('2026-08-13T00:00:00.000Z'),
        syncDeviceId: 'mac-1',
        source: 'MACOS_FOREGROUND',
        hour: 9,
        bundleId: 'app.editor',
        displayName: 'Editor',
        activeSeconds: 10,
        engagedSeconds: 3,
        pickups: null,
        notifications: 2,
      },
      {
        localDate: new Date('2026-08-13T00:00:00.000Z'),
        syncDeviceId: 'mac-1',
        source: 'MACOS_FOREGROUND',
        hour: 9,
        bundleId: 'app.editor',
        displayName: 'Editor',
        activeSeconds: 10,
        engagedSeconds: 3,
        pickups: null,
        notifications: 2,
      },
      {
        localDate: new Date('2026-08-13T00:00:00.000Z'),
        syncDeviceId: 'ios-1',
        source: 'DEVICE_ACTIVITY',
        hour: 9,
        bundleId: 'app.editor',
        displayName: 'Editor',
        activeSeconds: 20,
        engagedSeconds: null,
        pickups: 4,
        notifications: null,
      },
    ]);
    const result = await new PrismaReviewDataSource(prisma as never).loadPeriodData('user-1', period);

    const appUsage = result.metrics.appUsage as any;
    expect(appUsage).toMatchObject({
      activeSeconds: 30,
      engagedSeconds: 3,
      pickups: 4,
      notifications: 2,
      sourceTotals: {
        MACOS_FOREGROUND: { activeSeconds: 10, engagedSeconds: 3 },
        DEVICE_ACTIVITY: { activeSeconds: 20, engagedSeconds: null, pickups: 4 },
      },
    });
  });

  it('prefers summaries per browser installation and falls back for other installations', async () => {
    const prisma = prismaMock();
    prisma.websiteUsageSummary.findMany.mockResolvedValue([
      {
        localDate: new Date('2026-08-13T00:00:00.000Z'),
        syncDeviceId: 'browser-1',
        source: 'BROWSER',
        hour: -1,
        browserBundleId: 'browser',
        browserDisplayName: 'Browser',
        hostname: 'example.com',
        urlKey: 'example',
        activeSeconds: 30,
      },
    ]);
    prisma.websiteActivitySession.findMany.mockResolvedValue([
      {
        installationId: '1',
        startedAt: new Date('2026-08-12T17:30:00.000Z'),
        hostname: 'example.com',
        pageTitle: 'Duplicated',
        activeSeconds: 99,
      },
      {
        installationId: '2',
        startedAt: new Date('2026-08-12T18:30:00.000Z'),
        hostname: 'fallback.test',
        pageTitle: 'Fallback',
        activeSeconds: 7,
      },
    ]);
    const result = await new PrismaReviewDataSource(prisma as never).loadPeriodData('user-1', period);

    expect(result.metrics.websiteUsage).toMatchObject({
      activeSeconds: 37,
      sourceTotals: { BROWSER: { activeSeconds: 37 } },
    });
    expect(result.details.websiteUsage).toEqual([
      { hostname: 'example.com', activeSeconds: 30, pageTitles: [] },
      { hostname: 'fallback.test', activeSeconds: 7, pageTitles: ['Fallback'] },
    ]);
    expect(JSON.stringify(result)).not.toContain('browser-1');
  });

  it('uses date-only expense bounds and canonicalizes health per local date while deduplicating workouts', async () => {
    const prisma = prismaMock();
    prisma.expense.findMany.mockResolvedValue([]);
    prisma.healthSummary.findMany.mockResolvedValue([
      {
        localDate: new Date('2026-08-13T00:00:00.000Z'),
        syncDeviceId: 'device-z',
        updatedAt: new Date('2026-08-13T02:00:00.000Z'),
        steps: 1,
        walkingRunningDistanceMeters: 1,
        activeEnergyKcal: 1,
        exerciseMinutes: 1,
        standHours: 1,
        sleepMinutes: 1,
        restingHeartRateBpm: 60,
        hrvMilliseconds: 20,
        workoutCount: 1,
        workoutMinutes: 10,
        workoutEnergyKcal: 5,
      },
      {
        localDate: new Date('2026-08-13T00:00:00.000Z'),
        syncDeviceId: 'device-a',
        updatedAt: new Date('2026-08-13T03:00:00.000Z'),
        steps: 0,
        walkingRunningDistanceMeters: 0,
        activeEnergyKcal: 0,
        exerciseMinutes: 0,
        standHours: null,
        sleepMinutes: null,
        restingHeartRateBpm: null,
        hrvMilliseconds: null,
        workoutCount: 2,
        workoutMinutes: 20,
        workoutEnergyKcal: 0,
      },
    ]);
    prisma.healthWorkout.findMany.mockResolvedValue([
      {
        healthKitUUID: 'uuid-1',
        syncDeviceId: 'device-z',
        activityType: 'RUN',
        startedAt: new Date('2026-08-12T18:00:00Z'),
        durationSeconds: 60,
        energyKcal: 1,
      },
      {
        healthKitUUID: 'uuid-1',
        syncDeviceId: 'device-a',
        activityType: 'RUN',
        startedAt: new Date('2026-08-12T18:00:00Z'),
        durationSeconds: 60,
        energyKcal: 1,
      },
      {
        healthKitUUID: 'uuid-2',
        syncDeviceId: 'device-a',
        activityType: 'WALK',
        startedAt: new Date('2026-08-12T19:00:00Z'),
        durationSeconds: 120,
        energyKcal: null,
      },
    ]);
    const result = await new PrismaReviewDataSource(prisma as never).loadPeriodData('user-1', period);

    expect(prisma.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          expenseDate: {
            gte: new Date('2026-08-13T00:00:00.000Z'),
            lt: new Date('2026-08-14T00:00:00.000Z'),
          },
        }),
      }),
    );
    expect(result.metrics.health).toMatchObject({
      available: true,
      steps: 0,
      workoutCount: 2,
      workoutMinutes: 20,
      workouts: 2,
    });
    expect(result.coverage.health).toEqual({ available: true, coveredDays: 1, expectedDays: 1 });
    expect((result.metrics.health as any).workouts).toBe(2);
    expect(JSON.stringify(result)).not.toContain('uuid-1');
    expect(JSON.stringify(result)).not.toContain('device-a');
  });
});
