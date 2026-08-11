import { PrismaUsageRepository } from './prisma-usage.repository';

describe('PrismaUsageRepository website activity sessions', () => {
  it('uses composite installation/session idempotency', async () => {
    const upsert = jest.fn();
    const prisma = {
      $transaction: jest.fn(async (run: (tx: any) => Promise<void>) => run({ websiteActivitySession: { upsert } })),
    } as any;
    const repo = new PrismaUsageRepository(prisma);
    await expect(repo.ingestWebsiteActivitySessions('user-1', [{
      id: 'session-1', installationId: 'install-1', browserBundleId: 'chrome', browserDisplayName: 'Chrome',
      startedAt: new Date('2026-08-11T10:00:00Z'), endedAt: new Date('2026-08-11T10:01:00Z'), activeSeconds: 60,
      hostname: 'example.com', url: 'https://example.com/', pageTitle: null, isPrivate: false, timezone: 'UTC',
    }])).resolves.toEqual(['session-1']);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { installationId_id: { installationId: 'install-1', id: 'session-1' } },
      create: expect.objectContaining({ userId: 'user-1', id: 'session-1' }),
      update: expect.objectContaining({ activeSeconds: 60 }),
    }));
  });

  it('updates a checkpointed session without changing ownership', async () => {
    const upsert = jest.fn();
    const prisma = {
      $transaction: jest.fn(async (run: (tx: any) => Promise<void>) => run({ websiteActivitySession: { upsert } })),
    } as any;
    const repo = new PrismaUsageRepository(prisma);
    const base = {
      id: 'session-1', installationId: 'install-1', browserBundleId: 'chrome', browserDisplayName: 'Chrome',
      startedAt: new Date('2026-08-11T10:00:00Z'), hostname: 'example.com', url: 'https://example.com/', pageTitle: 'Old', isPrivate: false, timezone: 'UTC',
    };
    await repo.ingestWebsiteActivitySessions('user-1', [{ ...base, endedAt: new Date('2026-08-11T10:01:00Z'), activeSeconds: 60 }]);
    await repo.ingestWebsiteActivitySessions('user-1', [{ ...base, endedAt: new Date('2026-08-11T10:02:00Z'), activeSeconds: 120, pageTitle: 'New' }]);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[1][0]).toEqual(expect.objectContaining({
      where: { installationId_id: { installationId: 'install-1', id: 'session-1' } },
      update: expect.objectContaining({ endedAt: new Date('2026-08-11T10:02:00Z'), activeSeconds: 120, pageTitle: 'New' }),
    }));
    expect(upsert.mock.calls[1][0].update).not.toHaveProperty('userId');
    expect(upsert.mock.calls[1][0].update).not.toHaveProperty('installationId');
  });

  it('keeps browser installation ownership stable across retries', async () => {
    const findUnique = jest.fn().mockResolvedValue({ userId: 'user-1' });
    const upsert = jest.fn();
    const prisma = { syncDevice: { findUnique, upsert } } as any;
    await expect(new PrismaUsageRepository(prisma).ensureBrowserExtensionDevice('user-1', 'install-1'))
      .resolves.toBe('browser-install-1');
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'browser-install-1' }, select: { userId: true } });
    expect(upsert).toHaveBeenCalledWith({
      where: { id: 'browser-install-1' },
      create: { id: 'browser-install-1', userId: 'user-1', platform: 'WEB' },
      update: { lastSeenAt: expect.any(Date) },
    });
  });

  it('rejects an installation claimed by another user before upsert', async () => {
    const findUnique = jest.fn().mockResolvedValue({ userId: 'user-2' });
    const upsert = jest.fn();
    const prisma = { syncDevice: { findUnique, upsert } } as any;
    await expect(new PrismaUsageRepository(prisma).ensureBrowserExtensionDevice('user-1', 'install-1'))
      .rejects.toThrow('Browser installation belongs to another user');
    expect(upsert).not.toHaveBeenCalled();
  });
});
