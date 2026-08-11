import { Injectable } from '@nestjs/common';
import type {
  IUsageRepository,
  UsageAppIdentityRecord,
  UsageAppIdentityWrite,
  UsageSummaryRecord,
  UsageSummaryWrite,
  WebsiteActivitySessionRecord,
  WebsiteActivitySessionWrite,
  WebsiteUsageSummaryRecord,
  WebsiteUsageSummaryWrite,
} from '@core/application/ports/out/repositories.port';
import { DEFAULT_USAGE_PREFERENCES } from '@core/application/use-cases/preferences.service';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaUsageRepository implements IUsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findDevice(userId: string, deviceId: string) {
    return this.prisma.syncDevice.findFirst({ where: { id: deviceId, userId }, select: { platform: true } });
  }

  async findSummaries(userId: string, from: Date, toExclusive: Date): Promise<UsageSummaryRecord[]> {
    const rows = await this.prisma.usageSummary.findMany({
      where: { userId, localDate: { gte: from, lt: toExclusive } },
      select: {
        localDate: true,
        hour: true,
        bundleId: true,
        displayName: true,
        activeSeconds: true,
        engagedSeconds: true,
      },
      orderBy: [{ localDate: 'asc' }, { hour: 'asc' }, { activeSeconds: 'desc' }],
    });
    if (rows.length === 0) return rows;
    const identities = await this.prisma.usageAppIdentity.findMany({
      where: { userId, bundleId: { in: [...new Set(rows.map((row) => row.bundleId))] } },
      select: { bundleId: true, iconHash: true, iconStorageKey: true },
    });
    const byBundle = new Map(identities.map((identity) => [identity.bundleId, identity]));
    return rows.map((row) => ({ ...row, ...byBundle.get(row.bundleId) }));
  }

  async listAppIdentities(userId: string): Promise<UsageAppIdentityRecord[]> {
    return this.prisma.usageAppIdentity.findMany({
      where: { userId },
      select: { bundleId: true, displayName: true, iconHash: true, iconStorageKey: true },
      orderBy: { displayName: 'asc' },
    });
  }

  async findAppIdentity(userId: string, bundleId: string): Promise<UsageAppIdentityRecord | null> {
    return this.prisma.usageAppIdentity.findUnique({
      where: { userId_bundleId: { userId, bundleId } },
      select: { bundleId: true, displayName: true, iconHash: true, iconStorageKey: true },
    });
  }

  async upsertAppIdentity(userId: string, data: UsageAppIdentityWrite): Promise<UsageAppIdentityRecord> {
    return this.prisma.usageAppIdentity.upsert({
      where: { userId_bundleId: { userId, bundleId: data.bundleId } },
      create: { userId, ...data },
      update: { displayName: data.displayName, iconHash: data.iconHash, iconStorageKey: data.iconStorageKey },
      select: { bundleId: true, displayName: true, iconHash: true, iconStorageKey: true },
    });
  }

  async getTrackingPreferences(userId: string) {
    const record = await this.prisma.userPreferences.findUnique({
      where: { userId },
      select: { usagePreferences: true },
    });
    return {
      ...DEFAULT_USAGE_PREFERENCES,
      ...((record?.usagePreferences as Partial<typeof DEFAULT_USAGE_PREFERENCES>) || {}),
    };
  }

  async replaceBatch(userId: string, deviceId: string, summaries: UsageSummaryWrite[]) {
    return this.prisma.$transaction(async (tx) => {
      for (const summary of summaries) {
        await tx.usageSummary.upsert({
          where: {
            syncDeviceId_localDate_hour_bundleId: {
              syncDeviceId: deviceId,
              localDate: summary.localDate,
              hour: summary.hour,
              bundleId: summary.bundleId,
            },
          },
          create: { ...summary, userId, syncDeviceId: deviceId },
          update: {
            displayName: summary.displayName,
            timezone: summary.timezone,
            activeSeconds: summary.activeSeconds,
            engagedSeconds: summary.engagedSeconds,
          },
        });
      }
      return summaries.length;
    });
  }

  async findWebsiteSummaries(userId: string, from: Date, toExclusive: Date): Promise<WebsiteUsageSummaryRecord[]> {
    return this.prisma.websiteUsageSummary.findMany({
      where: { userId, localDate: { gte: from, lt: toExclusive } },
      select: {
        localDate: true,
        browserBundleId: true,
        browserDisplayName: true,
        hostname: true,
        url: true,
        activeSeconds: true,
      },
      orderBy: [{ localDate: 'asc' }, { activeSeconds: 'desc' }],
    });
  }

  async findWebsiteUrls(
    userId: string,
    from: Date,
    toExclusive: Date,
    hostname: string,
    limit: number,
    offset: number,
  ) {
    const rows = await this.prisma.websiteUsageSummary.groupBy({
      by: ['url'],
      where: {
        userId,
        hostname,
        url: { not: null },
        localDate: { gte: from, lt: toExclusive },
      },
      _sum: { activeSeconds: true },
      orderBy: { _sum: { activeSeconds: 'desc' } },
    });

    const validRows = rows.filter((r): r is typeof r & { url: string } => r.url !== null);
    const total = validRows.length;
    const paged = validRows.slice(offset, offset + limit);

    return {
      total,
      items: paged.map((row) => ({
        url: row.url,
        activeSeconds: row._sum.activeSeconds ?? 0,
      })),
    };
  }

  async replaceWebsiteBatch(userId: string, deviceId: string, summaries: WebsiteUsageSummaryWrite[]) {
    return this.prisma.$transaction(async (tx) => {
      for (const summary of summaries) {
        await tx.websiteUsageSummary.upsert({
          where: {
            syncDeviceId_localDate_browserBundleId_urlKey: {
              syncDeviceId: deviceId,
              localDate: summary.localDate,
              browserBundleId: summary.browserBundleId,
              urlKey: summary.urlKey,
            },
          },
          create: { ...summary, userId, syncDeviceId: deviceId },
          update: {
            browserDisplayName: summary.browserDisplayName,
            hostname: summary.hostname,
            url: summary.url,
            timezone: summary.timezone,
            activeSeconds: summary.activeSeconds,
          },
        });
      }
      return summaries.length;
    });
  }

  async ingestWebsiteActivitySessions(
    userId: string,
    sessions: WebsiteActivitySessionWrite[],
  ): Promise<string[]> {
    if (sessions.length === 0) return [];
    await this.prisma.$transaction(async (tx) => {
      for (const session of sessions) {
        await tx.websiteActivitySession.upsert({
          where: { installationId_id: { installationId: session.installationId, id: session.id } },
          create: { ...session, userId },
          update: {
            browserBundleId: session.browserBundleId,
            browserDisplayName: session.browserDisplayName,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            activeSeconds: session.activeSeconds,
            hostname: session.hostname,
            url: session.url,
            pageTitle: session.pageTitle,
            isPrivate: session.isPrivate,
            timezone: session.timezone,
          },
        });
      }
    });
    return sessions.map(({ id }) => id);
  }

  async findWebsiteActivitySessions(
    userId: string,
    from: Date,
    toExclusive: Date,
  ): Promise<WebsiteActivitySessionRecord[]> {
    return this.prisma.websiteActivitySession.findMany({
      where: { userId, startedAt: { gte: from, lt: toExclusive } },
      select: {
        id: true,
        userId: true,
        installationId: true,
        browserBundleId: true,
        browserDisplayName: true,
        startedAt: true,
        endedAt: true,
        activeSeconds: true,
        hostname: true,
        url: true,
        pageTitle: true,
        isPrivate: true,
        timezone: true,
        createdAt: true,
      },
      orderBy: { startedAt: 'asc' },
    });
  }

  async replaceBrowserExtensionCredential(userId: string, id: string, keyHash: string) {
    await this.prisma.browserExtensionCredential.upsert({
      where: { userId },
      create: { id, userId, keyHash },
      update: { id, keyHash },
    });
  }

  async findBrowserExtensionCredential(keyHash: string) {
    return this.prisma.browserExtensionCredential.findFirst({
      where: {
        keyHash,
        user: { deletedAt: null, deletionRequestedAt: null, bannedAt: null },
      },
      select: { userId: true },
    });
  }

  async ensureBrowserExtensionDevice(userId: string, installationId: string) {
    const id = `browser-${installationId}`;
    const existing = await this.prisma.syncDevice.findUnique({ where: { id }, select: { userId: true } });
    if (existing && existing.userId !== userId) throw new Error('Browser installation belongs to another user');
    await this.prisma.syncDevice.upsert({
      where: { id },
      create: { id, userId, platform: 'WEB' },
      update: { lastSeenAt: new Date() },
    });
    return id;
  }

  async delete(userId: string, from?: Date, toExclusive?: Date) {
    return (
      await this.prisma.usageSummary.deleteMany({
        where: { userId, ...(from && toExclusive ? { localDate: { gte: from, lt: toExclusive } } : {}) },
      })
    ).count;
  }

  async deleteWebsite(userId: string, from?: Date, toExclusive?: Date) {
    return (
      await this.prisma.websiteUsageSummary.deleteMany({
        where: { userId, ...(from && toExclusive ? { localDate: { gte: from, lt: toExclusive } } : {}) },
      })
    ).count;
  }

  async deleteExpired(now = new Date()) {
    const users = await this.prisma.userPreferences.findMany({ select: { userId: true, usagePreferences: true } });
    let deleted = 0;
    for (const user of users) {
      const preferences = {
        ...DEFAULT_USAGE_PREFERENCES,
        ...((user.usagePreferences as Partial<typeof DEFAULT_USAGE_PREFERENCES>) || {}),
      };
      const cutoff = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - preferences.retentionDays + 1),
      );
      deleted += (
        await this.prisma.usageSummary.deleteMany({ where: { userId: user.userId, localDate: { lt: cutoff } } })
      ).count;
      deleted += (
        await this.prisma.websiteUsageSummary.deleteMany({ where: { userId: user.userId, localDate: { lt: cutoff } } })
      ).count;
    }
    return deleted;
  }
}
