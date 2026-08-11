import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import { USAGE_CONSTANTS } from '@core/application/constants/app.constants';
import { TOKENS } from '@core/application/constants/tokens';
import type {
  IUsageRepository,
  UsageAppIdentityWrite,
  WebsiteActivitySessionWrite,
  WebsiteUsageSummaryWrite,
} from '@core/application/ports/out/repositories.port';
import type { IMediaStorage } from '@core/application/ports/out/services.port';
import { DEFAULT_USAGE_PREFERENCES } from './preferences.service';

export interface UsageSummaryInput {
  localDate: string;
  hour?: number;
  bundleId: string;
  displayName: string;
  timezone: string;
  activeSeconds: number;
  engagedSeconds?: number;
}

export interface UsageSummaryBatchInput {
  deviceId: string;
  summaries: UsageSummaryInput[];
}

export interface WebsiteUsageSummaryBatchInput {
  deviceId: string;
  summaries: WebsiteUsageSummaryInput[];
}

export interface BrowserExtensionUsageBatchInput {
  installationId: string;
  summaries: WebsiteUsageSummaryInput[];
}

export interface WebsiteActivitySessionInput {
  id: string;
  startedAt: string;
  endedAt: string;
  browserBundleId: string;
  browserDisplayName: string;
  hostname: string;
  url: string;
  pageTitle?: string | null;
  isPrivate: boolean;
  timezone: string;
}

export interface WebsiteActivitySessionBatchInput {
  installationId: string;
  sessions: WebsiteActivitySessionInput[];
}

export interface UsageAppIconInput {
  bundleId: string;
  displayName: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

const MAX_BATCH_SIZE = USAGE_CONSTANTS.maxBatchSize;
const MAX_ACTIVE_SECONDS = USAGE_CONSTANTS.maxActiveSeconds;

function parseDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${field} must use YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${field} is not a valid date`);
  }
  return date;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function localDateFor(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function nextDay(date: Date): Date {
  return new Date(date.getTime() + 86_400_000);
}

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function normalizeHostname(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 253) {
    throw new BadRequestException('hostname must be a valid hostname');
  }
  const hostname = value.toLowerCase();
  if (!USAGE_CONSTANTS.hostnamePattern.test(hostname)) {
    throw new BadRequestException('hostname must contain only a normalized hostname');
  }
  return hostname;
}

function validateWebsiteRange(start: Date, end: Date): void {
  if (start > end) throw new BadRequestException('from must not be after to');
  const days = (end.getTime() - start.getTime()) / 86_400_000 + 1;
  if (days > USAGE_CONSTANTS.maxDateRangeDays) throw new BadRequestException('Usage date range cannot exceed 365 days');
}

@Injectable()
export class UsageService {
  constructor(
    @Inject(TOKENS.USAGE_REPOSITORY) private readonly usage: IUsageRepository,
    @Optional() @Inject(TOKENS.MEDIA_STORAGE) private readonly media?: IMediaStorage,
  ) {}

  async getSummaries(userId: string, from?: string, to?: string) {
    const today = new Date();
    const defaultTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const retentionDays =
      from || to
        ? DEFAULT_USAGE_PREFERENCES.retentionDays
        : (await this.usage.getTrackingPreferences(userId)).retentionDays;
    const defaultFrom = new Date(defaultTo.getTime() - (retentionDays - 1) * 86_400_000);
    const start = from ? parseDate(from, 'from') : defaultFrom;
    const end = to ? parseDate(to, 'to') : defaultTo;
    if (start > end) throw new BadRequestException('from must not be after to');
    if ((end.getTime() - start.getTime()) / 86_400_000 + 1 > 365) {
      throw new BadRequestException('Usage date range cannot exceed 365 days');
    }

    const rows = await this.usage.findSummaries(userId, start, nextDay(end));
    const daily = new Map<string, { activeSeconds: number; engagedSeconds: number; hasEngaged: boolean }>();
    const dailyApps = new Map<
      string,
      {
        localDate: string;
        bundleId: string;
        displayName: string;
        activeSeconds: number;
        engagedSeconds: number;
        hasEngaged: boolean;
      }
    >();
    const apps = new Map<
      string,
      {
        bundleId: string;
        displayName: string;
        activeSeconds: number;
        engagedSeconds: number;
        hasEngaged: boolean;
        iconHash?: string | null;
        iconStorageKey?: string | null;
      }
    >();
    const hourlyApps = new Map<
      string,
      {
        localDate: string;
        hour: number;
        bundleId: string;
        displayName: string;
        activeSeconds: number;
        engagedSeconds: number;
        hasEngaged: boolean;
      }
    >();

    let totalActiveSeconds = 0;
    let totalEngagedSeconds = 0;
    let observedActiveSeconds = 0;

    for (const row of rows) {
      const day = dateKey(row.localDate);
      const hasEngaged = row.engagedSeconds !== null && row.engagedSeconds !== undefined;
      const engaged = row.engagedSeconds ?? 0;

      totalActiveSeconds += row.activeSeconds;
      if (hasEngaged) {
        totalEngagedSeconds += engaged;
        observedActiveSeconds += row.activeSeconds;
      }

      const d = daily.get(day) ?? { activeSeconds: 0, engagedSeconds: 0, hasEngaged: false };
      d.activeSeconds += row.activeSeconds;
      if (hasEngaged) {
        d.engagedSeconds += engaged;
        d.hasEngaged = true;
      }
      daily.set(day, d);

      const dailyAppKey = `${day}\u0000${row.bundleId}`;
      const dailyApp = dailyApps.get(dailyAppKey) ?? {
        localDate: day,
        bundleId: row.bundleId,
        displayName: row.displayName,
        activeSeconds: 0,
        engagedSeconds: 0,
        hasEngaged: false,
        iconHash: row.iconHash,
        iconStorageKey: row.iconStorageKey,
      };
      dailyApp.activeSeconds += row.activeSeconds;
      if (hasEngaged) {
        dailyApp.engagedSeconds += engaged;
        dailyApp.hasEngaged = true;
      }
      dailyApps.set(dailyAppKey, dailyApp);

      if (row.hour >= 0 && row.hour <= 23) {
        const hourlyAppKey = `${day}\u0000${row.hour}\u0000${row.bundleId}`;
        const hourlyApp = hourlyApps.get(hourlyAppKey) ?? {
          localDate: day,
          hour: row.hour,
          bundleId: row.bundleId,
          displayName: row.displayName,
          activeSeconds: 0,
          engagedSeconds: 0,
          hasEngaged: false,
        };
        hourlyApp.activeSeconds += row.activeSeconds;
        if (hasEngaged) {
          hourlyApp.engagedSeconds += engaged;
          hourlyApp.hasEngaged = true;
        }
        hourlyApps.set(hourlyAppKey, hourlyApp);
      }

      const app = apps.get(row.bundleId) ?? {
        bundleId: row.bundleId,
        displayName: row.displayName,
        activeSeconds: 0,
        engagedSeconds: 0,
        hasEngaged: false,
      };
      app.activeSeconds += row.activeSeconds;
      if (hasEngaged) {
        app.engagedSeconds += engaged;
        app.hasEngaged = true;
      }
      if (!app.displayName && row.displayName) app.displayName = row.displayName;
      if (!app.iconHash && row.iconHash) app.iconHash = row.iconHash;
      if (!app.iconStorageKey && row.iconStorageKey) app.iconStorageKey = row.iconStorageKey;
      apps.set(row.bundleId, app);
    }

    const hasAnyObserved = observedActiveSeconds > 0;
    const isComplete = totalActiveSeconds > 0 && observedActiveSeconds === totalActiveSeconds;

    return {
      from: dateKey(start),
      to: dateKey(end),
      totalActiveSeconds,
      totalEngagedSeconds: hasAnyObserved ? totalEngagedSeconds : undefined,
      engagementCoverage: {
        observedActiveSeconds,
        totalActiveSeconds,
        complete: isComplete,
      },
      topApps: [...apps.values()]
        .sort((a, b) => b.activeSeconds - a.activeSeconds)
        .slice(0, 10)
        .map((a) => ({
          bundleId: a.bundleId,
          displayName: a.displayName,
          activeSeconds: a.activeSeconds,
          ...(a.hasEngaged ? { engagedSeconds: a.engagedSeconds } : {}),
          ...this.iconResponse(a.iconHash, a.iconStorageKey),
        })),
      daily: [...daily.entries()].map(([localDate, val]) => ({
        localDate,
        activeSeconds: val.activeSeconds,
        engagedSeconds: val.hasEngaged ? val.engagedSeconds : undefined,
      })),
      dailyApps: [...dailyApps.values()].map((a) => ({
        localDate: a.localDate,
        bundleId: a.bundleId,
        displayName: a.displayName,
        activeSeconds: a.activeSeconds,
        engagedSeconds: a.hasEngaged ? a.engagedSeconds : undefined,
      })),
      hourlyApps: [...hourlyApps.values()].map((a) => ({
        localDate: a.localDate,
        hour: a.hour,
        bundleId: a.bundleId,
        displayName: a.displayName,
        activeSeconds: a.activeSeconds,
        engagedSeconds: a.hasEngaged ? a.engagedSeconds : undefined,
      })),
    };
  }

  async getAppIdentities(userId: string) {
    const identities = await this.usage.listAppIdentities(userId);
    return identities.map((identity) => ({
      bundleId: identity.bundleId,
      displayName: identity.displayName,
      ...this.iconResponse(identity.iconHash, identity.iconStorageKey),
    }));
  }

  async replaceAppIcon(userId: string, input: UsageAppIconInput) {
    const bundleId = requireText(input.bundleId, 'bundleId');
    const displayName = requireText(input.displayName, 'displayName').trim();
    if (!displayName) throw new BadRequestException('displayName is required and must be at most 255 characters');
    if (!this.media) throw new Error('Media storage is not configured');

    const hash = createHash('sha256').update(input.buffer).digest('hex');
    const existing = await this.usage.findAppIdentity(userId, bundleId);
    if (existing?.iconHash === hash && existing.iconStorageKey) {
      const identity = await this.usage.upsertAppIdentity(userId, {
        bundleId,
        displayName,
        iconHash: hash,
        iconStorageKey: existing.iconStorageKey,
      });
      return {
        bundleId: identity.bundleId,
        displayName: identity.displayName,
        ...this.iconResponse(identity.iconHash, identity.iconStorageKey),
      };
    }

    const stored = await this.media.storeUserImage({
      userId,
      folder: 'usage-app-icons',
      originalName: input.originalName,
      mimeType: input.mimeType,
      buffer: input.buffer,
    });
    const write: UsageAppIdentityWrite = {
      bundleId,
      displayName,
      iconHash: hash,
      iconStorageKey: stored.storageKey,
    };
    let identity;
    try {
      identity = await this.usage.upsertAppIdentity(userId, write);
    } catch (error) {
      await this.media.delete(stored.storageKey).catch(() => undefined);
      throw error;
    }
    if (existing?.iconStorageKey && existing.iconStorageKey !== stored.storageKey) {
      await this.media.delete(existing.iconStorageKey).catch(() => undefined);
    }
    return {
      bundleId: identity.bundleId,
      displayName: identity.displayName,
      ...this.iconResponse(identity.iconHash, identity.iconStorageKey),
    };
  }

  private iconResponse(iconHash?: string | null, iconStorageKey?: string | null) {
    return {
      ...(iconHash ? { iconHash } : {}),
      ...(iconStorageKey ? { iconUrl: `/media/${iconStorageKey}` } : {}),
    };
  }

  async replaceBatch(userId: string, input: UsageSummaryBatchInput) {
    if (!input.deviceId || !Array.isArray(input.summaries) || input.summaries.length > MAX_BATCH_SIZE) {
      throw new BadRequestException(`summaries must contain at most ${MAX_BATCH_SIZE} entries`);
    }
    const device = await this.usage.findDevice(userId, input.deviceId);
    if (!device) throw new ForbiddenException('Sync device does not belong to this user');
    if (device.platform !== 'MACOS') throw new BadRequestException('Usage summaries require a macOS Sync Device');

    const preferences = await this.usage.getTrackingPreferences(userId);
    if (!preferences.trackingEnabled) return { accepted: false, replaced: 0 };

    const unique = new Map<string, UsageSummaryInput>();
    for (const summary of input.summaries) {
      const localDate = parseDate(summary.localDate, 'localDate');
      if (typeof summary.bundleId !== 'string' || !summary.bundleId || summary.bundleId.length > 255)
        throw new BadRequestException('bundleId is required and must be at most 255 characters');
      if (typeof summary.displayName !== 'string' || !summary.displayName || summary.displayName.length > 255)
        throw new BadRequestException('displayName is required and must be at most 255 characters');
      if (
        typeof summary.timezone !== 'string' ||
        !summary.timezone ||
        summary.timezone.length > 100 ||
        !validTimezone(summary.timezone)
      )
        throw new BadRequestException('timezone must be a valid IANA timezone');
      if (
        !Number.isInteger(summary.activeSeconds) ||
        summary.activeSeconds < 0 ||
        summary.activeSeconds > MAX_ACTIVE_SECONDS
      )
        throw new BadRequestException('activeSeconds must be an integer between 0 and 86400');
      if (summary.engagedSeconds !== undefined && summary.engagedSeconds !== null) {
        if (
          !Number.isInteger(summary.engagedSeconds) ||
          summary.engagedSeconds < 0 ||
          summary.engagedSeconds > summary.activeSeconds
        ) {
          throw new BadRequestException('engagedSeconds must be an integer between 0 and activeSeconds');
        }
      }
      if (summary.hour !== undefined && (!Number.isInteger(summary.hour) || summary.hour < 0 || summary.hour > 23))
        throw new BadRequestException('hour must be an integer between 0 and 23');
      unique.set(`${dateKey(localDate)}\u0000${summary.hour ?? -1}\u0000${summary.bundleId}`, {
        ...summary,
        localDate: dateKey(localDate),
      });
    }
    const replaced = await this.usage.replaceBatch(
      userId,
      input.deviceId,
      [...unique.values()].map((summary) => ({
        ...summary,
        hour: summary.hour ?? -1,
        localDate: parseDate(summary.localDate, 'localDate'),
      })),
    );
    return { accepted: true, replaced };
  }

  async getWebsiteSummaries(userId: string, from?: string, to?: string, includeUrlDetails = true) {
    const preferences = await this.usage.getTrackingPreferences(userId);
    const today = new Date();
    const defaultTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const defaultFrom = new Date(defaultTo.getTime() - (preferences.retentionDays - 1) * 86_400_000);
    const start = from ? parseDate(from, 'from') : defaultFrom;
    const end = to ? parseDate(to, 'to') : defaultTo;
    validateWebsiteRange(start, end);

    const rows = await this.usage.findWebsiteSummaries(userId, start, nextDay(end));
    const daily = new Map<string, number>();
    const hostnames = new Map<string, number>();
    const urls = new Map<string, { url: string; hostname: string; activeSeconds: number }>();
    const browsers = new Map<string, { browserBundleId: string; browserDisplayName: string; activeSeconds: number }>();
    for (const row of rows) {
      const day = dateKey(row.localDate);
      daily.set(day, (daily.get(day) ?? 0) + row.activeSeconds);
      hostnames.set(row.hostname, (hostnames.get(row.hostname) ?? 0) + row.activeSeconds);
      if (includeUrlDetails && row.url) {
        const detail = urls.get(row.url) ?? { url: row.url, hostname: row.hostname, activeSeconds: 0 };
        detail.activeSeconds += row.activeSeconds;
        urls.set(row.url, detail);
      }
      const browser = browsers.get(row.browserBundleId) ?? {
        browserBundleId: row.browserBundleId,
        browserDisplayName: row.browserDisplayName,
        activeSeconds: 0,
      };
      browser.activeSeconds += row.activeSeconds;
      if (!browser.browserDisplayName && row.browserDisplayName) browser.browserDisplayName = row.browserDisplayName;
      browsers.set(row.browserBundleId, browser);
    }
    const hostnameSummaries = [...hostnames.entries()]
      .map(([hostname, activeSeconds]) => ({ hostname, activeSeconds }))
      .sort((a, b) => b.activeSeconds - a.activeSeconds);
    return {
      from: dateKey(start),
      to: dateKey(end),
      totalActiveSeconds: rows.reduce((total, row) => total + row.activeSeconds, 0),
      hostnames: hostnameSummaries,
      topHostnames: hostnameSummaries.slice(0, 10),
      urlDetails: includeUrlDetails ? [...urls.values()].sort((a, b) => b.activeSeconds - a.activeSeconds) : [],
      daily: [...daily.entries()].map(([localDate, activeSeconds]) => ({ localDate, activeSeconds })),
      browsers: [...browsers.values()].sort((a, b) => b.activeSeconds - a.activeSeconds),
    };
  }

  async ingestWebsiteActivitySessions(userId: string, input: WebsiteActivitySessionBatchInput) {
    if (!input || typeof input.installationId !== 'string' || !Array.isArray(input.sessions)) {
      throw new BadRequestException('installationId and sessions are required');
    }
    if (input.installationId.length === 0 || input.installationId.length > 128) {
      throw new BadRequestException('installationId must be at most 128 characters');
    }
    if (input.sessions.length > MAX_BATCH_SIZE) {
      throw new BadRequestException(`sessions must contain at most ${MAX_BATCH_SIZE} entries`);
    }
    try {
      await this.usage.ensureBrowserExtensionDevice(userId, input.installationId);
    } catch {
      throw new ForbiddenException('Website installation does not belong to this user');
    }
    const preferences = await this.usage.getTrackingPreferences(userId);
    if (!preferences.trackingEnabled || !preferences.websiteTrackingEnabled) {
      return {
        accepted: [],
        rejected: input.sessions.map((session) => ({ id: session.id, reason: 'tracking_disabled' })),
      };
    }

    const acceptedWrites = new Map<string, WebsiteActivitySessionWrite>();
    const rejected: Array<{ id: string; reason: string }> = [];
    for (const session of input.sessions) {
      const id = typeof session?.id === 'string' ? session.id : '';
      try {
        if (!id || id.length > 128) throw new Error('id is required and must be at most 128 characters');
        if (acceptedWrites.has(id)) throw new Error('duplicate session id');
        const startedAt = parseInstant(session.startedAt, 'startedAt');
        const endedAt = parseInstant(session.endedAt, 'endedAt');
        const activeSeconds = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
        if (activeSeconds <= 0 || activeSeconds > MAX_ACTIVE_SECONDS) {
          throw new Error('session duration must be between 1 and 86400 seconds');
        }
        const browserBundleId = requireText(session.browserBundleId, 'browserBundleId');
        const browserDisplayName = requireText(session.browserDisplayName, 'browserDisplayName');
        const hostname = normalizeHostname(session.hostname);
        const url = normalizeActivityUrl(session.url, hostname);
        const pageTitle = sanitizePageTitle(session.pageTitle);
        const timezone = requireTimezone(session.timezone);
        if (typeof session.isPrivate !== 'boolean') throw new Error('isPrivate must be a boolean');
        acceptedWrites.set(id, {
          id,
          installationId: input.installationId,
          browserBundleId,
          browserDisplayName,
          startedAt,
          endedAt,
          activeSeconds,
          hostname,
          url,
          pageTitle,
          isPrivate: session.isPrivate,
          timezone,
        });
      } catch (error) {
        rejected.push({ id, reason: error instanceof Error ? error.message : 'invalid session' });
      }
    }
    const accepted = await this.usage.ingestWebsiteActivitySessions(userId, [...acceptedWrites.values()]);
    return { accepted, rejected };
  }

  async getWebsiteStatistics(userId: string, from?: string, to?: string) {
    const preferences = await this.usage.getTrackingPreferences(userId);
    if (!preferences.trackingEnabled || !preferences.websiteTrackingEnabled) {
      throw new ForbiddenException('Website tracking authorization is required');
    }
    const { start, end } = this.websiteDateRange(preferences.retentionDays, from, to);
    const candidates = await this.usage.findWebsiteActivitySessions(
      userId,
      new Date(start.getTime() - 86_400_000),
      new Date(nextDay(end).getTime() + 86_400_000),
    );
    const rows = candidates
      .map((row) => ({ ...row, localDate: localDateFor(row.startedAt, row.timezone) }))
      .filter((row) => row.localDate >= dateKey(start) && row.localDate <= dateKey(end));
    const byHostname = new Map<string, number>();
    const byUrl = new Map<string, {
      url: string;
      hostname: string;
      activeSeconds: number;
      latestTitle: string | null;
      latestAt: number;
      isPrivate: boolean;
    }>();
    const daily = new Map<string, number>();
    for (const row of rows) {
      byHostname.set(row.hostname, (byHostname.get(row.hostname) ?? 0) + row.activeSeconds);
      daily.set(row.localDate, (daily.get(row.localDate) ?? 0) + row.activeSeconds);
      if (row.url) {
        const key = `${row.isPrivate ? 'private' : 'public'}\u0000${row.url}`;
        const detail = byUrl.get(key) ?? {
          url: row.url,
          hostname: row.hostname,
          activeSeconds: 0,
          latestTitle: null,
          latestAt: 0,
          isPrivate: row.isPrivate,
        };
        detail.activeSeconds += row.activeSeconds;
        detail.isPrivate = detail.isPrivate || row.isPrivate;
        const at = row.endedAt.getTime();
        if (at >= detail.latestAt && (row.pageTitle !== null || detail.latestTitle === null)) {
          detail.latestAt = at;
          detail.latestTitle = row.pageTitle;
        }
        byUrl.set(key, detail);
      }
    }
    const hostnames = [...byHostname.entries()]
      .map(([hostname, activeSeconds]) => ({ hostname, activeSeconds }))
      .sort((a, b) => b.activeSeconds - a.activeSeconds);
    return {
      from: dateKey(start),
      to: dateKey(end),
      totalActiveSeconds: rows.reduce((sum, row) => sum + row.activeSeconds, 0),
      hostnames,
      topHostnames: hostnames.slice(0, 10),
      urlDetails: [...byUrl.values()]
        .sort((a, b) => b.activeSeconds - a.activeSeconds)
        .map(({ latestAt: _latestAt, ...detail }) => detail),
      daily: [...daily.entries()].map(([localDate, activeSeconds]) => ({ localDate, activeSeconds })),
      sessions: rows.map((row) => ({
        id: row.id,
        installationId: row.installationId,
        browserBundleId: row.browserBundleId,
        browserDisplayName: row.browserDisplayName,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt.toISOString(),
        activeSeconds: row.activeSeconds,
        hostname: row.hostname,
        localDate: row.localDate,
        url: row.url,
        pageTitle: row.pageTitle,
        isPrivate: row.isPrivate,
        timezone: row.timezone,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  private websiteDateRange(retentionDays: number, from?: string, to?: string) {
    const today = new Date();
    const defaultTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const defaultFrom = new Date(defaultTo.getTime() - (retentionDays - 1) * 86_400_000);
    const start = from ? parseDate(from, 'from') : defaultFrom;
    const end = to ? parseDate(to, 'to') : defaultTo;
    validateWebsiteRange(start, end);
    return { start, end };
  }

  async getWebsiteUrls(userId: string, hostname: string, from?: string, to?: string, limit = 100, offset = 0) {
    const preferences = await this.usage.getTrackingPreferences(userId);
    if (!preferences.trackingEnabled || !preferences.websiteTrackingEnabled) {
      throw new ForbiddenException('Website tracking authorization is required');
    }
    const normalizedHost = normalizeHostname(hostname);
    const today = new Date();
    const defaultTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const defaultFrom = new Date(defaultTo.getTime() - (preferences.retentionDays - 1) * 86_400_000);
    const start = from ? parseDate(from, 'from') : defaultFrom;
    const end = to ? parseDate(to, 'to') : defaultTo;
    validateWebsiteRange(start, end);

    const parsedLimit = Math.min(1000, Math.max(1, limit));
    const parsedOffset = Math.max(0, offset);

    return this.usage.findWebsiteUrls(userId, start, nextDay(end), normalizedHost, parsedLimit, parsedOffset);
  }

  async replaceWebsiteBatch(userId: string, input: WebsiteUsageSummaryBatchInput) {
    if (!input.deviceId || !Array.isArray(input.summaries) || input.summaries.length > MAX_BATCH_SIZE) {
      throw new BadRequestException(`summaries must contain at most ${MAX_BATCH_SIZE} entries`);
    }
    const device = await this.usage.findDevice(userId, input.deviceId);
    if (!device) throw new ForbiddenException('Sync device does not belong to this user');
    if (device.platform !== 'MACOS')
      throw new BadRequestException('Website usage summaries require a macOS Sync Device');

    return this.writeWebsiteBatch(userId, input.deviceId, input.summaries);
  }

  async generateBrowserExtensionDsn(userId: string) {
    const dsnKey = `itu_dsn_${randomBytes(32).toString('base64url')}`;
    await this.usage.replaceBrowserExtensionCredential(userId, randomUUID(), this.hashDsn(dsnKey));
    return { dsnKey };
  }

  async authenticateBrowserExtensionDsn(dsnKey: string) {
    if (!/^itu_dsn_[A-Za-z0-9_-]{43}$/.test(dsnKey)) return null;
    return this.usage.findBrowserExtensionCredential(this.hashDsn(dsnKey));
  }

  async ingestBrowserExtension(userId: string, input: BrowserExtensionUsageBatchInput) {
    if (!input || !Array.isArray(input.summaries) || input.summaries.length > MAX_BATCH_SIZE) {
      throw new BadRequestException(`summaries must contain at most ${MAX_BATCH_SIZE} entries`);
    }
    const deviceId = await this.usage.ensureBrowserExtensionDevice(userId, input.installationId);
    return this.writeWebsiteBatch(userId, deviceId, input.summaries);
  }

  private async writeWebsiteBatch(userId: string, deviceId: string, summaries: WebsiteUsageSummaryInput[]) {
    const preferences = await this.usage.getTrackingPreferences(userId);
    if (!preferences.trackingEnabled || !preferences.websiteTrackingEnabled) return { accepted: false, replaced: 0 };

    const unique = new Map<string, Omit<WebsiteUsageSummaryWrite, 'localDate'> & { localDate: string }>();
    for (const summary of summaries) {
      const localDate = parseDate(summary.localDate, 'localDate');
      const browserBundleId = requireText(summary.browserBundleId, 'browserBundleId');
      const browserDisplayName = requireText(summary.browserDisplayName, 'browserDisplayName');
      const hostname = normalizeHostname(summary.hostname);
      const url = normalizeWebsiteUrl(summary.url, hostname);
      const timezone = requireTimezone(summary.timezone);
      if (
        !Number.isInteger(summary.activeSeconds) ||
        summary.activeSeconds < 0 ||
        summary.activeSeconds > MAX_ACTIVE_SECONDS
      ) {
        throw new BadRequestException('activeSeconds must be an integer between 0 and 86400');
      }
      const urlKey = url ? createHash('sha256').update(url).digest('hex') : `legacy:${hostname}`;
      unique.set(`${dateKey(localDate)}\u0000${browserBundleId}\u0000${urlKey}`, {
        localDate: dateKey(localDate),
        browserBundleId,
        browserDisplayName,
        hostname,
        url,
        urlKey,
        timezone,
        activeSeconds: summary.activeSeconds,
      });
    }
    const writes: WebsiteUsageSummaryWrite[] = [...unique.values()].map((summary) => ({
      ...summary,
      localDate: parseDate(summary.localDate, 'localDate'),
    }));
    const replaced = await this.usage.replaceWebsiteBatch(userId, deviceId, writes);
    return { accepted: true, replaced };
  }

  private hashDsn(dsnKey: string) {
    return createHash('sha256').update(dsnKey).digest('hex');
  }

  async deleteWebsite(userId: string, from?: string, to?: string, all = false) {
    if (all || (!from && !to)) return { deletedCount: await this.usage.deleteWebsite(userId) };
    const start = parseDate(from ?? to!, 'from');
    const end = parseDate(to ?? from!, 'to');
    validateWebsiteRange(start, end);
    return { deletedCount: await this.usage.deleteWebsite(userId, start, nextDay(end)) };
  }

  async delete(userId: string, from?: string, to?: string, all = false) {
    if (all || (!from && !to)) return { deletedCount: await this.usage.delete(userId) };
    const start = parseDate(from ?? to!, 'from');
    const end = parseDate(to ?? from!, 'to');
    if (start > end) throw new BadRequestException('from must not be after to');
    if ((end.getTime() - start.getTime()) / 86_400_000 + 1 > 365) {
      throw new BadRequestException('Usage date range cannot exceed 365 days');
    }
    return { deletedCount: await this.usage.delete(userId, start, nextDay(end)) };
  }

  async cleanupExpired(now = new Date()): Promise<number> {
    return this.usage.deleteExpired(now);
  }
}

export interface WebsiteUsageSummaryInput {
  localDate: string;
  browserBundleId: string;
  browserDisplayName: string;
  hostname: string;
  url?: string;
  timezone: string;
  activeSeconds: number;
}

function normalizeWebsiteUrl(value: unknown, hostname: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    throw new BadRequestException('url must be a valid HTTP(S) URL at most 2048 characters');
  }
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || normalizeHostname(url.hostname) !== hostname) {
      throw new Error('invalid URL');
    }
    url.hash = '';
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    throw new BadRequestException('url must be a valid HTTP(S) URL matching hostname');
  }
}

function parseInstant(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !value || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be a valid ISO timestamp`);
  }
  return new Date(value);
}

function normalizeActivityUrl(value: unknown, hostname: string): string {
  if (value === undefined || value === null) throw new Error('url is required');
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    throw new Error('url must be a valid HTTP(S) URL at most 2048 characters');
  }
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || normalizeHostname(url.hostname) !== hostname) {
      throw new Error('invalid URL');
    }
    url.hash = '';
    url.search = '';
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    throw new Error('url must be a valid HTTP(S) URL matching hostname');
  }
}

function sanitizePageTitle(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > 512) throw new Error('pageTitle must be at most 512 characters');
  const sanitized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return sanitized || null;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255) {
    throw new BadRequestException(`${field} is required and must be at most 255 characters`);
  }
  return value;
}

function requireTimezone(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 100 || !validTimezone(value)) {
    throw new BadRequestException('timezone must be a valid IANA timezone');
  }
  return value;
}
