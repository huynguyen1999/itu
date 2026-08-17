import { UsageService } from './usage.service';

describe('UsageService', () => {
  const repo: any = {
    findDevice: jest.fn(),
    findSummaries: jest.fn(),
    getTrackingPreferences: jest.fn(),
    replaceBatch: jest.fn(),
    delete: jest.fn(),
    deleteExpired: jest.fn(),
    findWebsiteSummaries: jest.fn(),
    replaceWebsiteBatch: jest.fn(),
    deleteWebsite: jest.fn(),
    replaceBrowserExtensionCredential: jest.fn(),
    findBrowserExtensionCredential: jest.fn(),
    ensureBrowserExtensionDevice: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('aggregates only the authenticated user rows by day and app', async () => {
    repo.findSummaries.mockResolvedValue([
      { localDate: new Date('2026-08-01T00:00:00Z'), hour: 9, bundleId: 'a', displayName: 'A', activeSeconds: 10 },
      { localDate: new Date('2026-08-01T00:00:00Z'), hour: 10, bundleId: 'a', displayName: 'A', activeSeconds: 5 },
      { localDate: new Date('2026-08-02T00:00:00Z'), hour: -1, bundleId: 'b', displayName: 'B', activeSeconds: 8 },
    ]);
    const result = await new UsageService(repo).getSummaries('user-1', '2026-08-01', '2026-08-02');
    expect(result.totalActiveSeconds).toBe(23);
    expect(result.topApps[0]).toMatchObject({ bundleId: 'a', activeSeconds: 15 });
    expect(result.daily).toEqual([
      { localDate: '2026-08-01', activeSeconds: 15 },
      { localDate: '2026-08-02', activeSeconds: 8 },
    ]);
    expect(result.dailyApps).toEqual([
      { localDate: '2026-08-01', bundleId: 'a', displayName: 'A', activeSeconds: 15 },
      { localDate: '2026-08-02', bundleId: 'b', displayName: 'B', activeSeconds: 8 },
    ]);
    expect(result.hourlyApps).toEqual([
      { localDate: '2026-08-01', hour: 9, bundleId: 'a', displayName: 'A', activeSeconds: 10 },
      { localDate: '2026-08-01', hour: 10, bundleId: 'a', displayName: 'A', activeSeconds: 5 },
    ]);
    expect(repo.findSummaries).toHaveBeenCalledWith('user-1', expect.any(Date), expect.any(Date));
  });

  it('rejects a device owned by another user', async () => {
    repo.findDevice.mockResolvedValue(null);
    await expect(
      new UsageService(repo).replaceBatch('user-1', { deviceId: 'device-1', summaries: [] }),
    ).rejects.toThrow('Sync device does not belong to this user');
    expect(repo.findDevice).toHaveBeenCalledWith('user-1', 'device-1');
  });

  it('replaces a device/day/hour/app idempotently', async () => {
    repo.findDevice.mockResolvedValue({ platform: 'MACOS' });
    repo.getTrackingPreferences.mockResolvedValue({ trackingEnabled: true, retentionDays: 90 });
    const input = {
      deviceId: 'device-1',
      summaries: [
        { localDate: '2026-08-01', hour: 9, bundleId: 'a', displayName: 'A', timezone: 'UTC', activeSeconds: 10 },
      ],
    };
    await new UsageService(repo).replaceBatch('user-1', input);
    await new UsageService(repo).replaceBatch('user-1', input);
    expect(repo.replaceBatch).toHaveBeenCalledTimes(2);
  });

  it('accepts iOS DeviceActivity snapshots with absolute event counters', async () => {
    repo.findDevice.mockResolvedValue({ platform: 'IOS' });
    repo.getTrackingPreferences.mockResolvedValue({ trackingEnabled: true, retentionDays: 90 });
    repo.replaceBatch.mockResolvedValue(1);

    await expect(new UsageService(repo).replaceBatch('user-1', {
      deviceId: 'ios-device',
      summaries: [{
        source: 'DEVICE_ACTIVITY',
        localDate: '2026-08-01',
        hour: 9,
        bundleId: 'com.example.Editor',
        displayName: 'Editor',
        timezone: 'Asia/Ho_Chi_Minh',
        activeSeconds: 120,
        pickups: 3,
        notifications: 2,
      }],
    } as any)).resolves.toEqual({ accepted: true, replaced: 1 });

    expect(repo.replaceBatch).toHaveBeenCalledWith('user-1', 'ios-device', [expect.objectContaining({
      source: 'DEVICE_ACTIVITY',
      activeSeconds: 120,
      pickups: 3,
      notifications: 2,
    })]);
  });

  it('rejects DeviceActivity snapshots from macOS devices and negative event counters', async () => {
    repo.findDevice.mockResolvedValue({ platform: 'MACOS' });
    repo.getTrackingPreferences.mockResolvedValue({ trackingEnabled: true, retentionDays: 90 });
    const service = new UsageService(repo);

    await expect(service.replaceBatch('user-1', {
      deviceId: 'mac-device',
      summaries: [{ source: 'DEVICE_ACTIVITY', localDate: '2026-08-01', bundleId: 'a', displayName: 'A', timezone: 'UTC', activeSeconds: 1 }],
    } as any)).rejects.toThrow('DeviceActivity usage requires an iOS Sync Device');

    repo.findDevice.mockResolvedValue({ platform: 'IOS' });
    await expect(service.replaceBatch('user-1', {
      deviceId: 'ios-device',
      summaries: [{ source: 'DEVICE_ACTIVITY', localDate: '2026-08-01', bundleId: 'a', displayName: 'A', timezone: 'UTC', activeSeconds: 1, pickups: -1 }],
    } as any)).rejects.toThrow('pickups must be a nonnegative integer');

    await expect(service.replaceBatch('user-1', {
      deviceId: 'ios-device',
      summaries: [{ source: 'DEVICE_ACTIVITY', localDate: '2026-08-01', bundleId: 'a', displayName: 'A', timezone: 'UTC', activeSeconds: 1, notifications: -1 }],
    } as any)).rejects.toThrow('notifications must be a nonnegative integer');
  });

  it('rejects an invalid hour bucket', async () => {
    repo.findDevice.mockResolvedValue({ platform: 'MACOS' });
    repo.getTrackingPreferences.mockResolvedValue({ trackingEnabled: true, retentionDays: 90 });
    await expect(
      new UsageService(repo).replaceBatch('user-1', {
        deviceId: 'device-1',
        summaries: [
          { localDate: '2026-08-01', hour: 24, bundleId: 'a', displayName: 'A', timezone: 'UTC', activeSeconds: 10 },
        ],
      }),
    ).rejects.toThrow('hour must be an integer between 0 and 23');
  });

  it('deletes all rows when no range is provided', async () => {
    repo.delete.mockResolvedValue(4);
    await expect(new UsageService(repo).delete('user-1')).resolves.toEqual({ deletedCount: 4 });
    expect(repo.delete).toHaveBeenCalledWith('user-1');
  });

  it('aggregates the same app across multiple devices', async () => {
    repo.findSummaries.mockResolvedValue([
      { localDate: new Date('2026-08-01T00:00:00Z'), bundleId: 'a', displayName: 'A', activeSeconds: 10 },
      { localDate: new Date('2026-08-01T00:00:00Z'), bundleId: 'a', displayName: 'A', activeSeconds: 20 },
    ]);
    const result = await new UsageService(repo).getSummaries('user-1', '2026-08-01', '2026-08-01');
    expect(result.topApps).toEqual([{ bundleId: 'a', displayName: 'A', activeSeconds: 30 }]);
  });

  it('rejects reversed and overlong ranges', async () => {
    await expect(new UsageService(repo).getSummaries('user-1', '2026-08-02', '2026-08-01')).rejects.toThrow(
      'from must not be after to',
    );
    await expect(new UsageService(repo).getSummaries('user-1', '2025-01-01', '2026-01-01')).rejects.toThrow(
      'cannot exceed 365 days',
    );
    await expect(new UsageService(repo).delete('user-1', '2026-08-02', '2026-08-01')).rejects.toThrow(
      'from must not be after to',
    );
    await expect(new UsageService(repo).delete('user-1', '2025-01-01', '2026-01-01')).rejects.toThrow(
      'cannot exceed 365 days',
    );
  });

  it('does not upload when tracking is disabled', async () => {
    repo.findDevice.mockResolvedValue({ platform: 'MACOS' });
    repo.getTrackingPreferences.mockResolvedValue({ trackingEnabled: false, retentionDays: 90 });
    const result = await new UsageService(repo).replaceBatch('user-1', {
      deviceId: 'device-1',
      summaries: [{ localDate: '2026-08-01', bundleId: 'a', displayName: 'A', timezone: 'UTC', activeSeconds: 1 }],
    });
    expect(result).toEqual({ accepted: false, replaced: 0 });
    expect(repo.replaceBatch).not.toHaveBeenCalled();
  });

  it('passes deterministic cleanup time to the repository', async () => {
    repo.deleteExpired.mockResolvedValue(2);
    const now = new Date('2026-08-09T12:00:00Z');
    await expect(new UsageService(repo).cleanupExpired(now)).resolves.toBe(2);
    expect(repo.deleteExpired).toHaveBeenCalledWith(now);
  });

  it('aggregates website usage across devices and browsers', async () => {
    repo.getTrackingPreferences.mockResolvedValue({
      trackingEnabled: true,
      websiteTrackingEnabled: true,
      retentionDays: 90,
    });
    repo.findWebsiteSummaries.mockResolvedValue([
      {
        localDate: new Date('2026-08-01T00:00:00Z'),
        browserBundleId: 'edge',
        browserDisplayName: 'Edge',
        hostname: 'docs.swift.org',
        url: 'https://docs.swift.org/guide',
        activeSeconds: 10,
      },
      {
        localDate: new Date('2026-08-01T00:00:00Z'),
        browserBundleId: 'chrome',
        browserDisplayName: 'Chrome',
        hostname: 'docs.swift.org',
        url: 'https://docs.swift.org/guide',
        activeSeconds: 20,
      },
      {
        localDate: new Date('2026-08-02T00:00:00Z'),
        browserBundleId: 'edge',
        browserDisplayName: 'Edge',
        hostname: 'example.com',
        url: 'https://example.com/',
        activeSeconds: 5,
      },
    ]);

    const result = await new UsageService(repo).getWebsiteSummaries('user-1', '2026-08-01', '2026-08-07');

    expect(result.totalActiveSeconds).toBe(35);
    expect(result.hostnames).toEqual([
      { hostname: 'docs.swift.org', activeSeconds: 30 },
      { hostname: 'example.com', activeSeconds: 5 },
    ]);
    expect(result.topHostnames[0]).toEqual({ hostname: 'docs.swift.org', activeSeconds: 30 });
    expect(result.urlDetails).toEqual([
      { hostname: 'docs.swift.org', url: 'https://docs.swift.org/guide', activeSeconds: 30 },
      { hostname: 'example.com', url: 'https://example.com/', activeSeconds: 5 },
    ]);
    expect(result.browsers).toEqual(
      [
        { browserBundleId: 'edge', browserDisplayName: 'Edge', activeSeconds: 15 },
        { browserBundleId: 'chrome', browserDisplayName: 'Chrome', activeSeconds: 20 },
      ].sort((a, b) => b.activeSeconds - a.activeSeconds),
    );
  });

  it('replaces website totals only for an owned macOS device', async () => {
    repo.findDevice.mockResolvedValue({ platform: 'MACOS' });
    repo.getTrackingPreferences.mockResolvedValue({
      trackingEnabled: true,
      websiteTrackingEnabled: true,
      retentionDays: 90,
    });
    repo.replaceWebsiteBatch.mockResolvedValue(1);

    await expect(
      new UsageService(repo).replaceWebsiteBatch('user-1', {
        deviceId: 'device-1',
        summaries: [
          {
            localDate: '2026-08-01',
            browserBundleId: 'edge',
            browserDisplayName: 'Edge',
            hostname: 'DOCS.SWIFT.ORG',
            url: 'https://docs.swift.org/guide#install',
            timezone: 'UTC',
            activeSeconds: 10,
          },
        ],
      }),
    ).resolves.toEqual({ accepted: true, replaced: 1 });

    expect(repo.replaceWebsiteBatch).toHaveBeenCalledWith('user-1', 'device-1', [
      expect.objectContaining({
        hostname: 'docs.swift.org',
        url: 'https://docs.swift.org/guide',
        urlKey: expect.stringMatching(/^[a-f0-9]{64}$/),
        localDate: expect.any(Date),
      }),
    ]);
  });

  it('keeps DeviceActivity website hours separate without a browser identity', async () => {
    repo.findDevice.mockResolvedValue({ platform: 'IOS' });
    repo.getTrackingPreferences.mockResolvedValue({ trackingEnabled: true, websiteTrackingEnabled: true, retentionDays: 90 });
    repo.replaceWebsiteBatch.mockResolvedValue(2);

    await expect(new UsageService(repo).replaceWebsiteBatch('user-1', {
      deviceId: 'ios-device',
      summaries: [
        { source: 'DEVICE_ACTIVITY', localDate: '2026-08-01', hour: 9, browserDisplayName: 'Device Activity', hostname: 'example.com', url: 'https://example.com/a', timezone: 'UTC', activeSeconds: 10 },
        { source: 'DEVICE_ACTIVITY', localDate: '2026-08-01', hour: 10, browserDisplayName: 'Device Activity', hostname: 'example.com', url: 'https://example.com/a', timezone: 'UTC', activeSeconds: 20 },
      ],
    } as any)).resolves.toEqual({ accepted: true, replaced: 2 });

    expect(repo.replaceWebsiteBatch).toHaveBeenCalledWith('user-1', 'ios-device', [
      expect.objectContaining({ source: 'DEVICE_ACTIVITY', hour: 9, browserBundleId: null, activeSeconds: 10 }),
      expect.objectContaining({ source: 'DEVICE_ACTIVITY', hour: 10, browserBundleId: null, activeSeconds: 20 }),
    ]);
  });

  it('rejects a browser source on an iOS website device', async () => {
    repo.findDevice.mockResolvedValue({ platform: 'IOS' });
    await expect(new UsageService(repo).replaceWebsiteBatch('user-1', {
      deviceId: 'ios-device',
      summaries: [{ source: 'BROWSER', localDate: '2026-08-01', browserBundleId: 'edge', browserDisplayName: 'Edge', hostname: 'example.com', timezone: 'UTC', activeSeconds: 1 }],
    } as any)).rejects.toThrow('Browser website usage requires a macOS Sync Device');
  });

  it('supports one-day website ranges and rejects URLs outside the hostname', async () => {
    repo.getTrackingPreferences.mockResolvedValue({
      trackingEnabled: true,
      websiteTrackingEnabled: true,
      retentionDays: 90,
    });
    repo.findWebsiteSummaries.mockResolvedValue([]);
    await expect(new UsageService(repo).getWebsiteSummaries('user-1', '2026-08-01', '2026-08-01')).resolves.toEqual(
      expect.objectContaining({ totalActiveSeconds: 0 }),
    );

    repo.findDevice.mockResolvedValue({ platform: 'MACOS' });
    await expect(
      new UsageService(repo).replaceWebsiteBatch('user-1', {
        deviceId: 'device-1',
        summaries: [
          {
            localDate: '2026-08-01',
            browserBundleId: 'edge',
            browserDisplayName: 'Edge',
            hostname: 'example.com',
            url: 'https://other.example/path',
            timezone: 'UTC',
            activeSeconds: 1,
          },
        ],
      }),
    ).rejects.toThrow('matching hostname');
  });

  it('does not upload website usage unless both tracking switches are enabled', async () => {
    repo.findDevice.mockResolvedValue({ platform: 'MACOS' });
    repo.getTrackingPreferences.mockResolvedValue({
      trackingEnabled: true,
      websiteTrackingEnabled: false,
      retentionDays: 90,
    });

    await expect(
      new UsageService(repo).replaceWebsiteBatch('user-1', {
        deviceId: 'device-1',
        summaries: [
          {
            localDate: '2026-08-01',
            browserBundleId: 'edge',
            browserDisplayName: 'Edge',
            hostname: 'example.com',
            url: 'https://example.com/path',
            timezone: 'UTC',
            activeSeconds: 1,
          },
        ],
      }),
    ).resolves.toEqual({ accepted: false, replaced: 0 });
    expect(repo.replaceWebsiteBatch).not.toHaveBeenCalled();
  });

  it('generates a hash-only DSN and authenticates it', async () => {
    repo.findBrowserExtensionCredential.mockResolvedValue({ userId: 'user-1' });
    const service = new UsageService(repo);
    const { dsnKey } = await service.generateBrowserExtensionDsn('user-1');

    expect(dsnKey).toMatch(/^itu_dsn_[A-Za-z0-9_-]{43}$/);
    expect(repo.replaceBrowserExtensionCredential).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      expect.not.stringContaining(dsnKey),
    );
    await expect(service.authenticateBrowserExtensionDsn(dsnKey)).resolves.toEqual({ userId: 'user-1' });
    expect(repo.findBrowserExtensionCredential).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
  });

  it('ingests extension summaries under its installation device', async () => {
    repo.ensureBrowserExtensionDevice.mockResolvedValue('browser-installation');
    repo.getTrackingPreferences.mockResolvedValue({
      trackingEnabled: true,
      websiteTrackingEnabled: true,
      retentionDays: 90,
    });
    repo.replaceWebsiteBatch.mockResolvedValue(1);

    await expect(
      new UsageService(repo).ingestBrowserExtension('user-1', {
        installationId: '123e4567-e89b-42d3-a456-426614174000',
        summaries: [
          {
            localDate: '2026-08-09',
            browserBundleId: 'edge',
            browserDisplayName: 'Edge',
            hostname: 'example.com',
            url: 'https://example.com/path?q=1',
            timezone: 'UTC',
            activeSeconds: 30,
          },
        ],
      }),
    ).resolves.toEqual({ accepted: true, replaced: 1 });

    expect(repo.replaceWebsiteBatch).toHaveBeenCalledWith('user-1', 'browser-installation', expect.any(Array));
  });

  it('validates engagedSeconds in replaceBatch', async () => {
    repo.findDevice.mockResolvedValue({ platform: 'MACOS' });
    repo.getTrackingPreferences.mockResolvedValue({ trackingEnabled: true, retentionDays: 90 });
    const service = new UsageService(repo);

    await expect(
      service.replaceBatch('user-1', {
        deviceId: 'device-1',
        summaries: [
          {
            localDate: '2026-08-01',
            hour: 9,
            bundleId: 'a',
            displayName: 'A',
            timezone: 'UTC',
            activeSeconds: 10,
            engagedSeconds: -1,
          },
        ],
      }),
    ).rejects.toThrow('engagedSeconds must be an integer between 0 and activeSeconds');

    await expect(
      service.replaceBatch('user-1', {
        deviceId: 'device-1',
        summaries: [
          {
            localDate: '2026-08-01',
            hour: 9,
            bundleId: 'a',
            displayName: 'A',
            timezone: 'UTC',
            activeSeconds: 10,
            engagedSeconds: 15,
          },
        ],
      }),
    ).rejects.toThrow('engagedSeconds must be an integer between 0 and activeSeconds');
  });

  it('calculates totalEngagedSeconds and engagementCoverage in getSummaries', async () => {
    repo.findSummaries.mockResolvedValue([
      {
        localDate: new Date('2026-08-01T00:00:00Z'),
        hour: 9,
        bundleId: 'a',
        displayName: 'A',
        activeSeconds: 100,
        engagedSeconds: 80,
      },
      {
        localDate: new Date('2026-08-01T00:00:00Z'),
        hour: 10,
        bundleId: 'b',
        displayName: 'B',
        activeSeconds: 50,
        engagedSeconds: 50,
      },
    ]);
    const result = await new UsageService(repo).getSummaries('user-1', '2026-08-01', '2026-08-01');
    expect(result.totalActiveSeconds).toBe(150);
    expect(result.totalEngagedSeconds).toBe(130);
    expect(result.engagementCoverage).toEqual({
      observedActiveSeconds: 150,
      totalActiveSeconds: 150,
      complete: true,
    });
    expect(result.totalEngagedSeconds).toBeLessThanOrEqual(result.totalActiveSeconds);
    expect(result.engagementCoverage.observedActiveSeconds).toBeLessThanOrEqual(
      result.engagementCoverage.totalActiveSeconds,
    );
    expect(
      (result.engagementCoverage.observedActiveSeconds / result.engagementCoverage.totalActiveSeconds) * 100,
    ).toBeLessThanOrEqual(100);
    expect(result.topApps[0]).toMatchObject({ bundleId: 'a', activeSeconds: 100, engagedSeconds: 80 });
  });

  it('fetches paginated website URL details for a hostname', async () => {
    repo.getTrackingPreferences.mockResolvedValue({
      trackingEnabled: true,
      websiteTrackingEnabled: true,
      retentionDays: 90,
    });
    repo.findWebsiteUrls = jest.fn().mockResolvedValue({
      total: 1,
      items: [{ url: 'https://github.com/huynguyen1999/itu', activeSeconds: 120 }],
    });

    const result = await new UsageService(repo).getWebsiteUrls(
      'user-1',
      'github.com',
      '2026-08-01',
      '2026-08-01',
      50,
      0,
    );
    expect(result).toEqual({
      total: 1,
      items: [{ url: 'https://github.com/huynguyen1999/itu', activeSeconds: 120 }],
    });
    expect(repo.findWebsiteUrls).toHaveBeenCalledWith(
      'user-1',
      expect.any(Date),
      expect.any(Date),
      'github.com',
      50,
      0,
    );
  });

  it('returns authenticated icon URLs for app identities and omits fallback fields', async () => {
    repo.listAppIdentities = jest.fn().mockResolvedValue([
      { bundleId: 'a', displayName: 'A', iconHash: 'hash', iconStorageKey: 'user-1/usage-app-icons/a.webp' },
      { bundleId: 'b', displayName: 'B' },
    ]);
    await expect(new UsageService(repo).getAppIdentities('user-1')).resolves.toEqual([
      { bundleId: 'a', displayName: 'A', iconHash: 'hash', iconUrl: '/media/user-1/usage-app-icons/a.webp' },
      { bundleId: 'b', displayName: 'B' },
    ]);
  });

  it('stores a new icon, hashes it, and deletes the replaced file after upsert', async () => {
    repo.findAppIdentity = jest.fn().mockResolvedValue({
      bundleId: 'a',
      displayName: 'Old',
      iconHash: 'old-hash',
      iconStorageKey: 'user-1/usage-app-icons/old.webp',
    });
    repo.upsertAppIdentity = jest.fn().mockResolvedValue({
      bundleId: 'a',
      displayName: 'New',
      iconHash: '2bb80d537b1da3e38bd30361aa855686bde0ba3f7f7c7e5c2b6f8f7f7f7f7f7f',
      iconStorageKey: 'user-1/usage-app-icons/new.webp',
    });
    const media = {
      storeUserImage: jest.fn().mockResolvedValue({ storageKey: 'user-1/usage-app-icons/new.webp' }),
      delete: jest.fn().mockResolvedValue(undefined),
    } as any;
    const result = await new UsageService(repo, media).replaceAppIcon('user-1', {
      bundleId: 'a',
      displayName: 'New',
      originalName: 'icon.png',
      mimeType: 'image/png',
      buffer: Buffer.from('new-icon'),
    });
    expect(media.storeUserImage).toHaveBeenCalledWith(expect.objectContaining({ folder: 'usage-app-icons' }));
    expect(repo.upsertAppIdentity).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ bundleId: 'a', displayName: 'New', iconHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    );
    expect(media.delete).toHaveBeenCalledWith('user-1/usage-app-icons/old.webp');
    expect(result.iconUrl).toBe('/media/user-1/usage-app-icons/new.webp');
  });

  it('skips rewriting an icon when the uploaded bytes have the same hash', async () => {
    const buffer = Buffer.from('same-icon');
    const hash = require('node:crypto').createHash('sha256').update(buffer).digest('hex');
    repo.findAppIdentity = jest.fn().mockResolvedValue({
      bundleId: 'a',
      displayName: 'Old',
      iconHash: hash,
      iconStorageKey: 'user-1/usage-app-icons/old.webp',
    });
    repo.upsertAppIdentity = jest.fn().mockResolvedValue({
      bundleId: 'a',
      displayName: 'New',
      iconHash: hash,
      iconStorageKey: 'user-1/usage-app-icons/old.webp',
    });
    const media = { storeUserImage: jest.fn(), delete: jest.fn() } as any;
    await new UsageService(repo, media).replaceAppIcon('user-1', {
      bundleId: 'a',
      displayName: 'New',
      originalName: 'icon.png',
      mimeType: 'image/png',
      buffer,
    });
    expect(media.storeUserImage).not.toHaveBeenCalled();
    expect(media.delete).not.toHaveBeenCalled();
  });

  it('keeps the new icon when deleting the replaced file fails', async () => {
    repo.findAppIdentity = jest.fn().mockResolvedValue({
      bundleId: 'a',
      displayName: 'Old',
      iconHash: 'old-hash',
      iconStorageKey: 'user-1/usage-app-icons/old.webp',
    });
    repo.upsertAppIdentity = jest.fn().mockResolvedValue({
      bundleId: 'a',
      displayName: 'New',
      iconHash: 'new-hash',
      iconStorageKey: 'user-1/usage-app-icons/new.webp',
    });
    const media = {
      storeUserImage: jest.fn().mockResolvedValue({ storageKey: 'user-1/usage-app-icons/new.webp' }),
      delete: jest.fn().mockRejectedValue(new Error('old file unavailable')),
    } as any;

    await expect(
      new UsageService(repo, media).replaceAppIcon('user-1', {
        bundleId: 'a',
        displayName: 'New',
        originalName: 'icon.png',
        mimeType: 'image/png',
        buffer: Buffer.from('new-icon'),
      }),
    ).resolves.toMatchObject({ iconUrl: '/media/user-1/usage-app-icons/new.webp' });
    expect(repo.upsertAppIdentity).toHaveBeenCalled();
    expect(media.delete).toHaveBeenCalledWith('user-1/usage-app-icons/old.webp');
    expect(media.delete).not.toHaveBeenCalledWith('user-1/usage-app-icons/new.webp');
  });
});
