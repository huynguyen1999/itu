import { PrismaUsageRepository } from './prisma-usage.repository';

describe('PrismaUsageRepository', () => {
  it('scopes device lookup to the owning user', async () => {
    const prisma = { syncDevice: { findFirst: jest.fn().mockResolvedValue(null) } } as any;
    await new PrismaUsageRepository(prisma).findDevice('user-1', 'device-1');
    expect(prisma.syncDevice.findFirst).toHaveBeenCalledWith({
      where: { id: 'device-1', userId: 'user-1' },
      select: { platform: true },
    });
  });

  it('replaces totals with a composite-key upsert', async () => {
    const upsert = jest.fn();
    const prisma = {
      $transaction: jest.fn(async (run: (tx: any) => Promise<number>) => run({ usageSummary: { upsert } })),
    } as any;
    const localDate = new Date('2026-08-09T00:00:00.000Z');

    await new PrismaUsageRepository(prisma).replaceBatch('user-1', 'device-1', [
      { localDate, hour: 9, bundleId: 'com.example.Editor', displayName: 'Editor', timezone: 'UTC', activeSeconds: 60 },
    ]);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          syncDeviceId_localDate_hour_bundleId: {
            syncDeviceId: 'device-1',
            localDate,
            hour: 9,
            bundleId: 'com.example.Editor',
          },
        },
        update: { displayName: 'Editor', timezone: 'UTC', activeSeconds: 60 },
      }),
    );
  });

  it('replaces website totals with the full composite key', async () => {
    const upsert = jest.fn();
    const prisma = {
      $transaction: jest.fn(async (run: (tx: any) => Promise<number>) => run({ websiteUsageSummary: { upsert } })),
    } as any;
    const localDate = new Date('2026-08-09T00:00:00.000Z');

    await new PrismaUsageRepository(prisma).replaceWebsiteBatch('user-1', 'device-1', [
      {
        localDate,
        browserBundleId: 'com.microsoft.edgemac',
        browserDisplayName: 'Edge',
        hostname: 'docs.swift.org',
        url: 'https://docs.swift.org/guide',
        urlKey: 'url-key',
        timezone: 'UTC',
        activeSeconds: 60,
      },
    ]);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          syncDeviceId_localDate_browserBundleId_urlKey: {
            syncDeviceId: 'device-1',
            localDate,
            browserBundleId: 'com.microsoft.edgemac',
            urlKey: 'url-key',
          },
        },
        update: {
          browserDisplayName: 'Edge',
          hostname: 'docs.swift.org',
          url: 'https://docs.swift.org/guide',
          timezone: 'UTC',
          activeSeconds: 60,
        },
      }),
    );
  });

  it('finds only an active user for a hashed extension DSN', async () => {
    const findFirst = jest.fn().mockResolvedValue({ userId: 'user-1' });
    const prisma = { browserExtensionCredential: { findFirst } } as any;
    await new PrismaUsageRepository(prisma).findBrowserExtensionCredential('hash');
    expect(findFirst).toHaveBeenCalledWith({
      where: { keyHash: 'hash', user: { deletedAt: null, deletionRequestedAt: null, bannedAt: null } },
      select: { userId: true },
    });
  });

  it('bulk joins app identities without one query per summary row', async () => {
    const findSummaries = jest.fn().mockResolvedValue([
      { localDate: new Date('2026-08-09T00:00:00Z'), hour: 9, bundleId: 'a', displayName: 'A', activeSeconds: 1 },
      { localDate: new Date('2026-08-09T00:00:00Z'), hour: 10, bundleId: 'a', displayName: 'A', activeSeconds: 2 },
    ]);
    const findIdentities = jest
      .fn()
      .mockResolvedValue([{ bundleId: 'a', iconHash: 'hash', iconStorageKey: 'u/usage-app-icons/a.webp' }]);
    const prisma = { usageSummary: { findMany: findSummaries }, usageAppIdentity: { findMany: findIdentities } } as any;
    const result = await new PrismaUsageRepository(prisma).findSummaries('user-1', new Date(0), new Date());
    expect(findIdentities).toHaveBeenCalledTimes(1);
    expect(findIdentities).toHaveBeenCalledWith({
      where: { userId: 'user-1', bundleId: { in: ['a'] } },
      select: { bundleId: true, iconHash: true, iconStorageKey: true },
    });
    expect(result[0]).toMatchObject({ iconHash: 'hash', iconStorageKey: 'u/usage-app-icons/a.webp' });
  });
});
