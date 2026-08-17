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

  it('correctly splits interval across hour boundaries', () => {
    // 10:45 to 11:15 (30 minutes = 1800 seconds total, 15m in 10:00, 15m in 11:00)
    const startedAt = new Date('2026-08-17T10:45:00.000Z');
    const endedAt = new Date('2026-08-17T11:15:00.000Z');
    const slices = splitIntervalIntoHours(startedAt, endedAt, 1800);

    expect(slices.length).toBe(2);
    expect(slices[0].hour).toBe(10);
    expect(slices[0].seconds).toBe(900);
    expect(slices[1].hour).toBe(11);
    expect(slices[1].seconds).toBe(900);
    expect(slices[0].seconds + slices[1].seconds).toBe(1800);
  });
});
