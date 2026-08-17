import { Prisma } from '@prisma/client';
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
    const deleteMany = jest.fn();
    const prisma = {
      $transaction: jest.fn(async (run: (tx: any) => Promise<number>) => run({ usageSummary: { upsert, deleteMany } })),
    } as any;
    const localDate = new Date('2026-08-09T00:00:00.000Z');

    await new PrismaUsageRepository(prisma).replaceBatch('user-1', 'device-1', [
      { localDate, hour: 9, bundleId: 'com.example.Editor', displayName: 'Editor', timezone: 'UTC', activeSeconds: 60 },
    ]);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          syncDeviceId_source_localDate_hour_bundleId: {
            syncDeviceId: 'device-1',
            source: 'MACOS_FOREGROUND',
            localDate,
            hour: 9,
            bundleId: 'com.example.Editor',
          },
        },
        update: { displayName: 'Editor', timezone: 'UTC', activeSeconds: 60 },
      }),
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        source: 'MACOS_FOREGROUND',
        localDate,
        hour: 9,
        bundleId: { notIn: ['com.example.Editor'] },
      }),
    });
  });

  it('deletes omitted rows only inside the submitted source and hour window', async () => {
    const deleteMany = jest.fn();
    const upsert = jest.fn();
    const prisma = {
      $transaction: jest.fn(async (run: (tx: any) => Promise<number>) => run({ usageSummary: { upsert, deleteMany } })),
    } as any;
    const localDate = new Date('2026-08-09T00:00:00.000Z');

    await new PrismaUsageRepository(prisma).replaceBatch('user-1', 'ios-device', [
      {
        source: 'DEVICE_ACTIVITY',
        localDate,
        hour: 9,
        bundleId: 'app-a',
        displayName: 'A',
        timezone: 'UTC',
        activeSeconds: 120,
      },
    ]);

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        syncDeviceId: 'ios-device',
        source: 'DEVICE_ACTIVITY',
        localDate,
        hour: 9,
        bundleId: { notIn: ['app-a'] },
      },
    });
  });

  it('retries an app replacement after a serializable transaction conflict', async () => {
    const upsert = jest.fn();
    const deleteMany = jest.fn();
    const transaction = jest
      .fn()
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementation(async (run: (tx: any) => Promise<number>) => run({ usageSummary: { upsert, deleteMany } }));
    const prisma = { $transaction: transaction } as any;
    const localDate = new Date('2026-08-09T00:00:00.000Z');

    await new PrismaUsageRepository(prisma).replaceBatch('user-1', 'ios-device', [
      {
        source: 'DEVICE_ACTIVITY',
        localDate,
        hour: 9,
        bundleId: 'app-a',
        displayName: 'A',
        timezone: 'UTC',
        activeSeconds: 120,
      },
    ]);

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction.mock.calls[0][1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(transaction.mock.calls[1][1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('replaces website totals with the full composite key', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn();
    const update = jest.fn();
    const deleteMany = jest.fn();
    const prisma = {
      $transaction: jest.fn(async (run: (tx: any) => Promise<number>) =>
        run({ websiteUsageSummary: { findFirst, create, update, deleteMany } }),
      ),
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

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          syncDeviceId: 'device-1',
          source: 'BROWSER',
          localDate,
          hour: -1,
          browserBundleId: 'com.microsoft.edgemac',
          urlKey: 'url-key',
        }),
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          syncDeviceId: 'device-1',
          source: 'BROWSER',
          hour: -1,
          browserBundleId: 'com.microsoft.edgemac',
          urlKey: 'url-key',
        }),
      }),
    );
    expect(deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source: 'BROWSER',
          hour: -1,
          localDate,
        }),
      }),
    );
  });

  it('uses a source/hour/url key for DeviceActivity websites and replaces absolute values', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'row-1' });
    const create = jest.fn();
    const update = jest.fn();
    const deleteMany = jest.fn();
    const prisma = {
      $transaction: jest.fn(async (run: (tx: any) => Promise<number>) =>
        run({ websiteUsageSummary: { findFirst, create, update, deleteMany } }),
      ),
    } as any;
    const localDate = new Date('2026-08-09T00:00:00.000Z');

    await new PrismaUsageRepository(prisma).replaceWebsiteBatch('user-1', 'ios-device', [
      {
        source: 'DEVICE_ACTIVITY',
        hour: 10,
        localDate,
        browserBundleId: null,
        browserDisplayName: 'Device Activity',
        hostname: 'example.com',
        url: 'https://example.com/a',
        urlKey: 'url-key',
        timezone: 'UTC',
        activeSeconds: 240,
      },
    ]);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        syncDeviceId: 'ios-device',
        source: 'DEVICE_ACTIVITY',
        localDate,
        hour: 10,
        urlKey: 'url-key',
        browserBundleId: null,
      },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: expect.objectContaining({ activeSeconds: 240 }),
    });
    expect(deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source: 'DEVICE_ACTIVITY',
          localDate,
          hour: 10,
        }),
      }),
    );
  });

  it('retries a concurrent website insert after the partial unique index rejects it', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'row-1' });
    const create = jest.fn();
    const update = jest.fn();
    const deleteMany = jest.fn();
    const transaction = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 'P2002' }))
      .mockImplementation(async (run: (tx: any) => Promise<number>) =>
        run({ websiteUsageSummary: { findFirst, create, update, deleteMany } }),
      );
    const prisma = { $transaction: transaction } as any;
    const localDate = new Date('2026-08-09T00:00:00.000Z');

    await new PrismaUsageRepository(prisma).replaceWebsiteBatch('user-1', 'ios-device', [
      {
        source: 'DEVICE_ACTIVITY',
        localDate,
        hour: 10,
        browserBundleId: null,
        browserDisplayName: 'Device Activity',
        hostname: 'example.com',
        url: 'https://example.com/a',
        urlKey: 'url-key',
        timezone: 'UTC',
        activeSeconds: 240,
      },
    ]);

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction.mock.calls[0][1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(transaction.mock.calls[1][1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: expect.objectContaining({ activeSeconds: 240 }),
    });
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
