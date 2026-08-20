import { UsageService } from './usage.service';
import { splitIntervalIntoHours } from './usage-validation';

describe('ScreenTime Usage Ingestion', () => {
  const repo: any = {
    findDevice: jest.fn(),
    getTrackingPreferences: jest.fn(),
    ingestScreenTimeEvents: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repo.getTrackingPreferences.mockResolvedValue({
      trackingEnabled: true,
      websiteTrackingEnabled: true,
      retentionDays: 30,
      idleThresholdSeconds: 180,
      excludedBundleIds: [],
    });
  });

  it('rejects if collector device does not belong to user', async () => {
    repo.findDevice.mockResolvedValue(null);
    const service = new UsageService(repo);

    await expect(
      service.ingestScreenTimeEvents('user-1', {
        collectorDeviceId: 'mac-1',
        events: [],
      }),
    ).rejects.toThrow('Collector device does not belong to this user');
  });

  it('rejects if collector device platform is not MACOS', async () => {
    repo.findDevice.mockResolvedValue({ platform: 'IOS' });
    const service = new UsageService(repo);

    await expect(
      service.ingestScreenTimeEvents('user-1', {
        collectorDeviceId: 'ios-1',
        events: [],
      }),
    ).rejects.toThrow('Screen Time events require a macOS collector Sync Device');
  });

  it('ingests valid Screen Time events and passes to repository', async () => {
    repo.findDevice.mockResolvedValue({ platform: 'MACOS' });
    repo.ingestScreenTimeEvents.mockResolvedValue({ accepted: true, inserted: 1 });
    const service = new UsageService(repo);

    const result = await service.ingestScreenTimeEvents('user-1', {
      collectorDeviceId: 'mac-1',
      events: [
        {
          eventId: 'EID-12345',
          source: 'SCREEN_TIME_BIOME',
          sourceDeviceId: 'ios-device-1',
          sourceDeviceName: "Huy's iPhone",
          bundleId: 'ph.telegra.Telegraph',
          displayName: 'Telegram',
          startedAt: '2026-08-17T10:00:00.000Z',
          endedAt: '2026-08-17T10:05:00.000Z',
          durationSeconds: 300,
        },
      ],
    });

    expect(result).toEqual({ accepted: true, inserted: 1 });
    expect(repo.ingestScreenTimeEvents).toHaveBeenCalledWith(
      'user-1',
      'mac-1',
      expect.arrayContaining([
        expect.objectContaining({
          eventId: 'EID-12345',
          source: 'SCREEN_TIME_BIOME',
          sourceDeviceId: 'ios-device-1',
          bundleId: 'ph.telegra.Telegraph',
          displayName: 'Telegram',
          durationSeconds: 300,
        }),
      ]),
    );
  });

  it('correctly splits interval across hour boundaries in Asia/Ho_Chi_Minh', () => {
    // 10:45 UTC to 11:15 UTC = 17:45 to 18:15 in Asia/Ho_Chi_Minh (+07:00)
    const startedAt = new Date('2026-08-17T10:45:00.000Z');
    const endedAt = new Date('2026-08-17T11:15:00.000Z');
    const slices = splitIntervalIntoHours(startedAt, endedAt, 1800);

    expect(slices.length).toBe(2);
    expect(slices[0].hour).toBe(17);
    expect(slices[0].seconds).toBe(900);
    expect(slices[1].hour).toBe(18);
    expect(slices[1].seconds).toBe(900);
    expect(slices[0].seconds + slices[1].seconds).toBe(1800);
  });

  it('correctly splits interval across local midnight boundary', () => {
    // 16:45 UTC = 23:45 in Asia/Ho_Chi_Minh; 17:15 UTC = 00:15 next day in Asia/Ho_Chi_Minh
    const startedAt = new Date('2026-08-17T16:45:00.000Z');
    const endedAt = new Date('2026-08-17T17:15:00.000Z');
    const slices = splitIntervalIntoHours(startedAt, endedAt, 1800);

    expect(slices.length).toBe(2);
    expect(slices[0].localDate.toISOString().slice(0, 10)).toBe('2026-08-17');
    expect(slices[0].hour).toBe(23);
    expect(slices[1].localDate.toISOString().slice(0, 10)).toBe('2026-08-18');
    expect(slices[1].hour).toBe(0);
  });

  it('filters out loginwindow and system excluded bundle IDs on ingestion', async () => {
    repo.findDevice.mockResolvedValue({ platform: 'MACOS' });
    repo.ingestScreenTimeEvents.mockResolvedValue({ accepted: true, inserted: 1 });
    const service = new UsageService(repo);

    await service.ingestScreenTimeEvents('user-1', {
      collectorDeviceId: 'mac-1',
      events: [
        {
          eventId: 'EID-loginwindow',
          source: 'SCREEN_TIME_BIOME',
          sourceDeviceId: 'mac-1',
          bundleId: 'com.apple.loginwindow',
          displayName: 'loginwindow',
          startedAt: '2026-08-17T10:00:00.000Z',
          endedAt: '2026-08-17T10:05:00.000Z',
          durationSeconds: 300,
        },
        {
          eventId: 'EID-safari',
          source: 'SCREEN_TIME_BIOME',
          sourceDeviceId: 'mac-1',
          bundleId: 'com.apple.Safari',
          displayName: 'Safari',
          startedAt: '2026-08-17T10:00:00.000Z',
          endedAt: '2026-08-17T10:05:00.000Z',
          durationSeconds: 300,
        },
      ],
    });

    expect(repo.ingestScreenTimeEvents).toHaveBeenCalledWith(
      'user-1',
      'mac-1',
      [
        expect.objectContaining({
          eventId: 'EID-safari',
          bundleId: 'com.apple.Safari',
        }),
      ],
    );
  });
});

describe('ScreenTime Statistics & Timeline Union', () => {
  const repo: any = {
    getTrackingPreferences: jest.fn(),
    findScreenTimeEvents: jest.fn(),
    listScreenTimeDevices: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repo.getTrackingPreferences.mockResolvedValue({
      trackingEnabled: true,
      websiteTrackingEnabled: true,
      retentionDays: 30,
      idleThresholdSeconds: 180,
      excludedBundleIds: [],
    });
    repo.listScreenTimeDevices.mockResolvedValue([
      { deviceId: 'iphone-1', name: "Huy's iPhone", platform: 'IOS', lastSeenAt: new Date() },
      { deviceId: 'mac-1', name: "Huy's Mac", platform: 'MACOS', lastSeenAt: new Date() },
    ]);
  });

  it('accumulates simultaneous device intervals correctly for All Devices (70m)', async () => {
    // iPhone Safari: 10:00 - 10:30 UTC (30m / 1800s)
    // Mac Chrome:    10:10 - 10:50 UTC (40m / 2400s)
    // Accumulated across All Devices: 1800s + 2400s = 70m (4200s)
    repo.findScreenTimeEvents.mockResolvedValue([
      {
        id: '1',
        userId: 'user-1',
        collectorDeviceId: 'mac-1',
        sourceDeviceId: 'iphone-1',
        source: 'SCREEN_TIME_BIOME',
        eventId: 'E1',
        bundleId: 'com.apple.mobilesafari',
        displayName: 'Safari',
        startedAt: new Date('2026-08-17T10:00:00.000Z'),
        endedAt: new Date('2026-08-17T10:30:00.000Z'),
        durationSeconds: 1800,
      },
      {
        id: '2',
        userId: 'user-1',
        collectorDeviceId: 'mac-1',
        sourceDeviceId: 'mac-1',
        source: 'SCREEN_TIME_BIOME',
        eventId: 'E2',
        bundleId: 'com.google.Chrome',
        displayName: 'Google Chrome',
        startedAt: new Date('2026-08-17T10:10:00.000Z'),
        endedAt: new Date('2026-08-17T10:50:00.000Z'),
        durationSeconds: 2400,
      },
    ]);

    const service = new UsageService(repo);
    const stats = await service.getScreenTimeStatistics(
      'user-1',
      '2026-08-17',
      '2026-08-17',
      'all',
      'UTC',
    );

    // Headline Screen Time equals sum of device totals: 4200s (70m)
    expect(stats.screenTimeSeconds).toBe(4200);

    // Per-app active times: independently measured
    const safari = stats.apps.find((a) => a.bundleId === 'com.apple.mobilesafari');
    expect(safari?.activeSeconds).toBe(1800);

    const chrome = stats.apps.find((a) => a.bundleId === 'com.google.Chrome');
    expect(chrome?.activeSeconds).toBe(2400);

    // Hourly bar for hour 10: accumulated across devices to 4200s (70m)
    const hour10 = stats.hourlyScreenTime.find((h) => h.hour === 10);
    expect(hour10?.screenTimeSeconds).toBe(4200);
  });

  it('aggregates disjoint device intervals correctly (producing exact 60m)', async () => {
    // iPhone: 10:00 - 10:30 (30m)
    // Mac:    11:00 - 11:30 (30m)
    repo.findScreenTimeEvents.mockResolvedValue([
      {
        id: '1',
        userId: 'user-1',
        collectorDeviceId: 'mac-1',
        sourceDeviceId: 'iphone-1',
        source: 'SCREEN_TIME_BIOME',
        eventId: 'E1',
        bundleId: 'com.apple.mobilesafari',
        displayName: 'Safari',
        startedAt: new Date('2026-08-17T10:00:00.000Z'),
        endedAt: new Date('2026-08-17T10:30:00.000Z'),
        durationSeconds: 1800,
      },
      {
        id: '2',
        userId: 'user-1',
        collectorDeviceId: 'mac-1',
        sourceDeviceId: 'mac-1',
        source: 'SCREEN_TIME_BIOME',
        eventId: 'E2',
        bundleId: 'com.google.Chrome',
        displayName: 'Google Chrome',
        startedAt: new Date('2026-08-17T11:00:00.000Z'),
        endedAt: new Date('2026-08-17T11:30:00.000Z'),
        durationSeconds: 1800,
      },
    ]);

    const service = new UsageService(repo);
    const stats = await service.getScreenTimeStatistics(
      'user-1',
      '2026-08-17',
      '2026-08-17',
      'all',
      'UTC',
    );

    expect(stats.screenTimeSeconds).toBe(3600);
    expect(stats.hourlyScreenTime.find((h) => h.hour === 10)?.screenTimeSeconds).toBe(1800);
    expect(stats.hourlyScreenTime.find((h) => h.hour === 11)?.screenTimeSeconds).toBe(1800);
  });

  it('scopes statistics strictly to requested deviceId when specified', async () => {
    repo.findScreenTimeEvents.mockImplementation(async (_u: any, _s: any, _e: any, deviceId: any) => {
      if (deviceId === 'iphone-1') {
        return [
          {
            id: '1',
            userId: 'user-1',
            collectorDeviceId: 'mac-1',
            sourceDeviceId: 'iphone-1',
            source: 'SCREEN_TIME_BIOME',
            eventId: 'E1',
            bundleId: 'com.apple.mobilesafari',
            displayName: 'Safari',
            startedAt: new Date('2026-08-17T10:00:00.000Z'),
            endedAt: new Date('2026-08-17T10:30:00.000Z'),
            durationSeconds: 1800,
          },
        ];
      }
      return [];
    });

    const service = new UsageService(repo);
    const stats = await service.getScreenTimeStatistics(
      'user-1',
      '2026-08-17',
      '2026-08-17',
      'iphone-1',
      'UTC',
    );

    expect(stats.selectedDeviceScope).toBe('iphone-1');
    expect(stats.screenTimeSeconds).toBe(1800);
    expect(stats.apps.length).toBe(1);
    expect(stats.apps[0].bundleId).toBe('com.apple.mobilesafari');
  });
});
