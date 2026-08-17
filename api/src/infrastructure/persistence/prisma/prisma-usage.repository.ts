import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  IUsageRepository,
  UsageSource,
  UsageAppIdentityRecord,
  UsageAppIdentityWrite,
  ScreenTimeEventWrite,
  UsageSummaryRecord,
  UsageSummaryWrite,
  WebsiteActivitySessionRecord,
  WebsiteActivitySessionWrite,
  WebsiteUsageSummaryRecord,
  WebsiteUsageSummaryWrite,
} from '@core/application/ports/out/repositories.port';
import { DEFAULT_USAGE_PREFERENCES } from '@core/application/use-cases/preferences.service';
import { splitIntervalIntoHours } from '@core/application/use-cases/usage-validation';
import { PrismaService } from './prisma.service';

const MAX_USAGE_TRANSACTION_ATTEMPTS = 3;

function isRetryableUsageTransactionError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2034';
}

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
    for (let attempt = 0; attempt < MAX_USAGE_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const windows = new Map<
              string,
              { source: UsageSource; localDate: Date; hour: number; bundleIds: Set<string> }
            >();
            for (const summary of summaries) {
              const source = summary.source ?? 'MACOS_FOREGROUND';
              const hour = summary.hour ?? -1;
              const key = `${source}\u0000${summary.localDate.toISOString()}\u0000${hour}`;
              const window = windows.get(key) ?? {
                source,
                localDate: summary.localDate,
                hour,
                bundleIds: new Set<string>(),
              };
              window.bundleIds.add(summary.bundleId);
              windows.set(key, window);
            }
            for (const window of windows.values()) {
              await tx.usageSummary.deleteMany({
                where: {
                  userId,
                  syncDeviceId: deviceId,
                  source: window.source,
                  localDate: window.localDate,
                  hour: window.hour,
                  bundleId: { notIn: [...window.bundleIds] },
                },
              });
            }
            for (const summary of summaries) {
              const source = summary.source ?? 'MACOS_FOREGROUND';
              const hour = summary.hour ?? -1;
              await tx.usageSummary.upsert({
                where: {
                  syncDeviceId_source_localDate_hour_bundleId: {
                    syncDeviceId: deviceId,
                    source,
                    localDate: summary.localDate,
                    hour,
                    bundleId: summary.bundleId,
                  },
                },
                create: { ...summary, source, hour, userId, syncDeviceId: deviceId },
                update: {
                  displayName: summary.displayName,
                  timezone: summary.timezone,
                  activeSeconds: summary.activeSeconds,
                  engagedSeconds: summary.engagedSeconds,
                  pickups: summary.pickups,
                  notifications: summary.notifications,
                },
              });
            }
            return summaries.length;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (!isRetryableUsageTransactionError(error) || attempt === MAX_USAGE_TRANSACTION_ATTEMPTS - 1) throw error;
      }
    }
    throw new Error('Unable to replace usage summaries');
  }

  async ingestScreenTimeEvents(userId: string, collectorDeviceId: string, events: ScreenTimeEventWrite[]) {
    if (events.length === 0) return { accepted: true, inserted: 0 };
    for (let attempt = 0; attempt < MAX_USAGE_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const created = await tx.usageImportEvent.createMany({
              data: events.map((event) => ({
                userId,
                collectorDeviceId,
                sourceDeviceId: event.sourceDeviceId,
                sourceDeviceName: event.sourceDeviceName ?? null,
                source: event.source,
                eventId: event.eventId,
                bundleId: event.bundleId,
                displayName: event.displayName,
                startedAt: event.startedAt,
                endedAt: event.endedAt,
                durationSeconds: event.durationSeconds,
              })),
              skipDuplicates: true,
            });

            // Ensure sync device exists for source devices
            const uniqueSourceDevices = new Map<string, string | undefined>();
            for (const event of events) {
              if (!uniqueSourceDevices.has(event.sourceDeviceId)) {
                uniqueSourceDevices.set(event.sourceDeviceId, event.sourceDeviceName ?? undefined);
              }
            }

            for (const [sourceDeviceId] of uniqueSourceDevices) {
              const existing = await tx.syncDevice.findFirst({
                where: { id: sourceDeviceId, userId },
              });
              if (!existing) {
                await tx.syncDevice.upsert({
                  where: { id: sourceDeviceId },
                  create: {
                    id: sourceDeviceId,
                    userId,
                    platform: 'IOS',
                    lastSeenAt: new Date(),
                  },
                  update: {
                    lastSeenAt: new Date(),
                  },
                });
              }
            }

            // Upsert app identities
            const uniqueApps = new Map<string, string>();
            for (const event of events) {
              uniqueApps.set(event.bundleId, event.displayName);
            }
            for (const [bundleId, displayName] of uniqueApps) {
              await tx.usageAppIdentity.upsert({
                where: { userId_bundleId: { userId, bundleId } },
                create: { userId, bundleId, displayName },
                update: { displayName },
              });
            }

            // Aggregate events into UsageSummary
            for (const event of events) {
              if (event.durationSeconds <= 0) continue;
              const slices = splitIntervalIntoHours(event.startedAt, event.endedAt, event.durationSeconds);
              for (const slice of slices) {
                const existingSummary = await tx.usageSummary.findUnique({
                  where: {
                    syncDeviceId_source_localDate_hour_bundleId: {
                      syncDeviceId: event.sourceDeviceId,
                      source: event.source,
                      localDate: slice.localDate,
                      hour: slice.hour,
                      bundleId: event.bundleId,
                    },
                  },
                });

                if (existingSummary) {
                  await tx.usageSummary.update({
                    where: {
                      syncDeviceId_source_localDate_hour_bundleId: {
                        syncDeviceId: event.sourceDeviceId,
                        source: event.source,
                        localDate: slice.localDate,
                        hour: slice.hour,
                        bundleId: event.bundleId,
                      },
                    },
                    data: {
                      activeSeconds: existingSummary.activeSeconds + slice.seconds,
                      displayName: event.displayName,
                    },
                  });
                } else {
                  await tx.usageSummary.create({
                    data: {
                      userId,
                      syncDeviceId: event.sourceDeviceId,
                      source: event.source,
                      localDate: slice.localDate,
                      hour: slice.hour,
                      bundleId: event.bundleId,
                      displayName: event.displayName,
                      timezone: 'UTC',
                      activeSeconds: slice.seconds,
                    },
                  });
                }
              }
            }

            return { accepted: true, inserted: created.count };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (!isRetryableUsageTransactionError(error) || attempt === MAX_USAGE_TRANSACTION_ATTEMPTS - 1) throw error;
      }
    }
    throw new Error('Unable to ingest Screen Time events');
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
    for (let attempt = 0; attempt < MAX_USAGE_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const windows = new Map<
              string,
              {
                source: UsageSource;
                localDate: Date;
                hour: number;
                keys: Set<string>;
              }
            >();
            for (const summary of summaries) {
              const source = summary.source ?? 'BROWSER';
              const hour = summary.hour ?? -1;
              const key = `${source}\u0000${summary.localDate.toISOString()}\u0000${hour}`;
              const window = windows.get(key) ?? {
                source,
                localDate: summary.localDate,
                hour,
                keys: new Set<string>(),
              };
              window.keys.add(`${summary.browserBundleId ?? ''}\u0000${summary.urlKey}`);
              windows.set(key, window);
            }
            for (const window of windows.values()) {
              const keep = [...window.keys].map((key) => {
                const [browserBundleId, urlKey] = key.split('\u0000');
                return window.source === 'DEVICE_ACTIVITY'
                  ? { urlKey }
                  : { browserBundleId: browserBundleId || null, urlKey };
              });
              await tx.websiteUsageSummary.deleteMany({
                where: {
                  userId,
                  syncDeviceId: deviceId,
                  source: window.source,
                  localDate: window.localDate,
                  hour: window.hour,
                  NOT: keep,
                },
              });
            }
            for (const summary of summaries) {
              const source = summary.source ?? 'BROWSER';
              const hour = summary.hour ?? -1;
              const browserBundleId = summary.browserBundleId ?? null;
              const existing = await tx.websiteUsageSummary.findFirst({
                where: {
                  syncDeviceId: deviceId,
                  source,
                  localDate: summary.localDate,
                  hour,
                  urlKey: summary.urlKey,
                  browserBundleId,
                },
              });
              const data = {
                source,
                hour,
                browserBundleId,
                browserDisplayName: summary.browserDisplayName,
                hostname: summary.hostname,
                url: summary.url,
                timezone: summary.timezone,
                activeSeconds: summary.activeSeconds,
              };
              if (existing) {
                await tx.websiteUsageSummary.update({
                  where: { id: existing.id },
                  data,
                });
              } else {
                await tx.websiteUsageSummary.create({
                  data: {
                    ...data,
                    userId,
                    syncDeviceId: deviceId,
                    localDate: summary.localDate,
                    urlKey: summary.urlKey,
                  },
                });
              }
            }
            return summaries.length;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        // The partial unique indexes cannot be represented as a Prisma
        // composite `upsert` target. A concurrent create may win between our
        // lookup and create; retrying the whole transaction then observes and
        // updates that row atomically instead of surfacing a duplicate error.
        if (!isRetryableUsageTransactionError(error) || attempt === MAX_USAGE_TRANSACTION_ATTEMPTS - 1) throw error;
      }
    }
    throw new Error('Unable to replace website usage summaries');
  }

  async ingestWebsiteActivitySessions(userId: string, sessions: WebsiteActivitySessionWrite[]): Promise<string[]> {
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
            iconUrl: session.iconUrl,
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
        iconUrl: true,
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
