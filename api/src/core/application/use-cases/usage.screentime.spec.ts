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
