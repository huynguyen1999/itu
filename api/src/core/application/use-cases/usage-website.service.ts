import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { USAGE_CONSTANTS } from '@core/application/constants/app.constants';
import { USAGE_SOURCES } from '@core/application/ports/out/repositories.port';
import { ForbiddenResourceException, InvalidRequestException } from '@core/domain/exceptions';
import type {
  BrowserExtensionCredentialKind,
  IUsageRepository,
  UsageSource,
  WebsiteActivitySessionWrite,
  WebsiteUsageSummaryWrite,
} from '@core/application/ports/out/repositories.port';
import type {
  BrowserExtensionUsageBatchInput,
  WebsiteActivitySessionBatchInput,
  WebsiteUsageSummaryBatchInput,
  WebsiteUsageSummaryInput,
} from './usage.types';
import {
  dateKey,
  localDateFor,
  nextDay,
  normalizeActivityIconUrl,
  normalizeActivityUrl,
  normalizeHostname,
  normalizeWebsiteUrl,
  parseDate,
  parseInstant,
  requireText,
  requireTimezone,
  sanitizePageTitle,
  validateWebsiteRange,
} from './usage-validation';

const MAX_BATCH_SIZE = USAGE_CONSTANTS.maxBatchSize;
const MAX_ACTIVE_SECONDS = USAGE_CONSTANTS.maxActiveSeconds;

/** Website tracking reporting, ingestion, and credential use cases. */
export class UsageWebsiteService {
  constructor(private readonly usage: IUsageRepository) {}

  async getSummaries(userId: string, from?: string, to?: string, includeUrlDetails = true) {
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
      if (row.browserBundleId === null) continue;
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

  async ingestActivitySessions(userId: string, input: WebsiteActivitySessionBatchInput) {
    if (!input || typeof input.installationId !== 'string' || !Array.isArray(input.sessions)) {
      throw new InvalidRequestException('installationId and sessions are required');
    }
    if (input.installationId.length === 0 || input.installationId.length > 128) {
      throw new InvalidRequestException('installationId must be at most 128 characters');
    }
    if (input.sessions.length > MAX_BATCH_SIZE) {
      throw new InvalidRequestException(`sessions must contain at most ${MAX_BATCH_SIZE} entries`);
    }
    try {
      await this.usage.ensureBrowserExtensionDevice(userId, input.installationId);
    } catch {
      throw new ForbiddenResourceException('Website installation does not belong to this user');
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
        const iconUrl = normalizeActivityIconUrl(session.iconUrl);
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
          iconUrl,
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

  async getStatistics(userId: string, from?: string, to?: string) {
    const preferences = await this.usage.getTrackingPreferences(userId);
    if (!preferences.trackingEnabled || !preferences.websiteTrackingEnabled) {
      throw new ForbiddenResourceException('Website tracking authorization is required');
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
    const byUrl = new Map<
      string,
      {
        url: string;
        hostname: string;
        activeSeconds: number;
        latestTitle: string | null;
        latestAt: number;
        iconUrl: string | null;
        latestIconAt: number;
        isPrivate: boolean;
      }
    >();
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
          iconUrl: null,
          latestIconAt: 0,
          isPrivate: row.isPrivate,
        };
        detail.activeSeconds += row.activeSeconds;
        detail.isPrivate = detail.isPrivate || row.isPrivate;
        const at = row.endedAt.getTime();
        if (at >= detail.latestAt && (row.pageTitle !== null || detail.latestTitle === null)) {
          detail.latestAt = at;
          detail.latestTitle = row.pageTitle;
        }
        if (row.iconUrl && at >= detail.latestIconAt) {
          detail.latestIconAt = at;
          detail.iconUrl = row.iconUrl;
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
        .map(({ latestAt: _latestAt, latestIconAt: _latestIconAt, ...detail }) => detail),
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
        iconUrl: row.iconUrl ?? null,
        pageTitle: row.pageTitle,
        isPrivate: row.isPrivate,
        timezone: row.timezone,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async getUrls(userId: string, hostname: string, from?: string, to?: string, limit = 100, offset = 0) {
    const preferences = await this.usage.getTrackingPreferences(userId);
    if (!preferences.trackingEnabled || !preferences.websiteTrackingEnabled) {
      throw new ForbiddenResourceException('Website tracking authorization is required');
    }
    const normalizedHost = normalizeHostname(hostname);
    const today = new Date();
    const defaultTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const defaultFrom = new Date(defaultTo.getTime() - (preferences.retentionDays - 1) * 86_400_000);
    const start = from ? parseDate(from, 'from') : defaultFrom;
    const end = to ? parseDate(to, 'to') : defaultTo;
    validateWebsiteRange(start, end);
    return this.usage.findWebsiteUrls(
      userId,
      start,
      nextDay(end),
      normalizedHost,
      Math.min(1000, Math.max(1, limit)),
      Math.max(0, offset),
    );
  }

  async replaceBatch(userId: string, input: WebsiteUsageSummaryBatchInput) {
    if (!input.deviceId || !Array.isArray(input.summaries) || input.summaries.length > MAX_BATCH_SIZE) {
      throw new InvalidRequestException(`summaries must contain at most ${MAX_BATCH_SIZE} entries`);
    }
    const device = await this.usage.findDevice(userId, input.deviceId);
    if (!device) throw new ForbiddenResourceException('Sync device does not belong to this user');
    if (input.summaries.length === 0 && device.platform !== 'MACOS') {
      throw new InvalidRequestException('Website usage summaries require a macOS Sync Device');
    }
    for (const rawSummary of input.summaries) {
      const source = rawSummary.source ?? 'BROWSER';
      if (!USAGE_SOURCES.includes(source) || source === 'MACOS_FOREGROUND' || source === 'HEALTH_KIT') {
        throw new InvalidRequestException('source is invalid for website summaries');
      }
      if (source === 'DEVICE_ACTIVITY' && device.platform !== 'IOS') {
        throw new InvalidRequestException('DeviceActivity website usage requires an iOS Sync Device');
      }
      if (source === 'BROWSER' && device.platform !== 'MACOS') {
        throw new InvalidRequestException('Browser website usage requires a macOS Sync Device');
      }
    }
    return this.writeBatch(userId, input.deviceId, input.summaries);
  }

  async generateDsn(userId: string, kind: BrowserExtensionCredentialKind = 'DEFAULT_BROWSER') {
    const dsnKey = `itu_dsn_${randomBytes(32).toString('base64url')}`;
    await this.usage.replaceBrowserExtensionCredential(userId, randomUUID(), this.hashDsn(dsnKey), kind);
    return { dsnKey };
  }

  authenticateDsn(dsnKey: string) {
    if (!/^itu_dsn_[A-Za-z0-9_-]{43}$/.test(dsnKey)) return null;
    return this.usage.findBrowserExtensionCredential(this.hashDsn(dsnKey));
  }

  async ingestBrowserExtension(userId: string, input: BrowserExtensionUsageBatchInput) {
    if (!input || !Array.isArray(input.summaries) || input.summaries.length > MAX_BATCH_SIZE) {
      throw new InvalidRequestException(`summaries must contain at most ${MAX_BATCH_SIZE} entries`);
    }
    const deviceId = await this.usage.ensureBrowserExtensionDevice(userId, input.installationId);
    return this.writeBatch(userId, deviceId, input.summaries, 'BROWSER');
  }

  async delete(userId: string, from?: string, to?: string, all = false) {
    if (all || (!from && !to)) return { deletedCount: await this.usage.deleteWebsite(userId) };
    const start = parseDate(from ?? to!, 'from');
    const end = parseDate(to ?? from!, 'to');
    validateWebsiteRange(start, end);
    return { deletedCount: await this.usage.deleteWebsite(userId, start, nextDay(end)) };
  }

  private async writeBatch(
    userId: string,
    deviceId: string,
    summaries: WebsiteUsageSummaryInput[],
    sourceOverride?: UsageSource,
  ) {
    const preferences = await this.usage.getTrackingPreferences(userId);
    if (!preferences.trackingEnabled || !preferences.websiteTrackingEnabled) return { accepted: false, replaced: 0 };

    const unique = new Map<string, Omit<WebsiteUsageSummaryWrite, 'localDate'> & { localDate: string }>();
    for (const rawSummary of summaries) {
      const summary = rawSummary;
      if (sourceOverride && summary.source !== undefined && summary.source !== sourceOverride) {
        throw new InvalidRequestException('source is invalid for this website ingestion route');
      }
      const source = sourceOverride ?? summary.source ?? 'BROWSER';
      if (!USAGE_SOURCES.includes(source) || source === 'MACOS_FOREGROUND' || source === 'HEALTH_KIT') {
        throw new InvalidRequestException('source is invalid for website summaries');
      }
      const localDate = parseDate(summary.localDate, 'localDate');
      if (source === 'DEVICE_ACTIVITY' && summary.browserBundleId !== undefined && summary.browserBundleId !== null) {
        throw new InvalidRequestException('browserBundleId must be omitted for DeviceActivity summaries');
      }
      const browserBundleId =
        source === 'DEVICE_ACTIVITY' ? null : requireText(summary.browserBundleId, 'browserBundleId');
      const browserDisplayName =
        source === 'DEVICE_ACTIVITY'
          ? typeof summary.browserDisplayName === 'string' && summary.browserDisplayName.trim()
            ? summary.browserDisplayName.trim()
            : 'DeviceActivity'
          : requireText(summary.browserDisplayName, 'browserDisplayName');
      const hostname = normalizeHostname(summary.hostname);
      const url = normalizeWebsiteUrl(summary.url, hostname);
      const timezone = requireTimezone(summary.timezone);
      const hour = summary.hour ?? -1;
      if (!Number.isInteger(hour) || hour < -1 || hour > 23) {
        throw new InvalidRequestException('hour must be an integer between -1 and 23');
      }
      if (
        !Number.isInteger(summary.activeSeconds) ||
        summary.activeSeconds < 0 ||
        summary.activeSeconds > MAX_ACTIVE_SECONDS
      ) {
        throw new InvalidRequestException('activeSeconds must be an integer between 0 and 86400');
      }
      const urlKey = url ? createHash('sha256').update(url).digest('hex') : `legacy:${hostname}`;
      unique.set(`${source}\u0000${dateKey(localDate)}\u0000${hour}\u0000${browserBundleId ?? ''}\u0000${urlKey}`, {
        localDate: dateKey(localDate),
        browserBundleId,
        browserDisplayName,
        hostname,
        url,
        urlKey,
        timezone,
        activeSeconds: summary.activeSeconds,
        source,
        hour,
      });
    }
    const writes: WebsiteUsageSummaryWrite[] = [...unique.values()].map((summary) => ({
      ...summary,
      localDate: parseDate(summary.localDate, 'localDate'),
    }));
    const replaced = await this.usage.replaceWebsiteBatch(userId, deviceId, writes);
    return { accepted: true, replaced };
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

  private hashDsn(dsnKey: string) {
    return createHash('sha256').update(dsnKey).digest('hex');
  }
}
