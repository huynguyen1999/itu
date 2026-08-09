import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { USAGE_CONSTANTS } from '@core/application/constants/app.constants';
import { TOKENS } from '@core/application/constants/tokens';
import type { IUsageRepository, WebsiteUsageSummaryWrite } from '@core/application/ports/out/repositories.port';
import { DEFAULT_USAGE_PREFERENCES } from './preferences.service';

export interface UsageSummaryInput {
  localDate: string;
  hour?: number;
  bundleId: string;
  displayName: string;
  timezone: string;
  activeSeconds: number;
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
  constructor(@Inject(TOKENS.USAGE_REPOSITORY) private readonly usage: IUsageRepository) {}

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
    const daily = new Map<string, number>();
    const dailyApps = new Map<
      string,
      { localDate: string; bundleId: string; displayName: string; activeSeconds: number }
    >();
    const apps = new Map<string, { bundleId: string; displayName: string; activeSeconds: number }>();
    const hourlyApps = new Map<
      string,
      { localDate: string; hour: number; bundleId: string; displayName: string; activeSeconds: number }
    >();
    for (const row of rows) {
      const day = dateKey(row.localDate);
      daily.set(day, (daily.get(day) ?? 0) + row.activeSeconds);
      const dailyAppKey = `${day}\u0000${row.bundleId}`;
      const dailyApp = dailyApps.get(dailyAppKey) ?? {
        localDate: day,
        bundleId: row.bundleId,
        displayName: row.displayName,
        activeSeconds: 0,
      };
      dailyApp.activeSeconds += row.activeSeconds;
      dailyApps.set(dailyAppKey, dailyApp);
      if (row.hour >= 0 && row.hour <= 23) {
        const hourlyAppKey = `${day}\u0000${row.hour}\u0000${row.bundleId}`;
        const hourlyApp = hourlyApps.get(hourlyAppKey) ?? {
          localDate: day,
          hour: row.hour,
          bundleId: row.bundleId,
          displayName: row.displayName,
          activeSeconds: 0,
        };
        hourlyApp.activeSeconds += row.activeSeconds;
        hourlyApps.set(hourlyAppKey, hourlyApp);
      }
      const app = apps.get(row.bundleId) ?? { bundleId: row.bundleId, displayName: row.displayName, activeSeconds: 0 };
      app.activeSeconds += row.activeSeconds;
      if (!app.displayName && row.displayName) app.displayName = row.displayName;
      apps.set(row.bundleId, app);
    }
    const totalActiveSeconds = rows.reduce((total, row) => total + row.activeSeconds, 0);
    return {
      from: dateKey(start),
      to: dateKey(end),
      totalActiveSeconds,
      topApps: [...apps.values()].sort((a, b) => b.activeSeconds - a.activeSeconds).slice(0, 10),
      daily: [...daily.entries()].map(([localDate, activeSeconds]) => ({ localDate, activeSeconds })),
      dailyApps: [...dailyApps.values()],
      hourlyApps: [...hourlyApps.values()],
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

  async getWebsiteSummaries(userId: string, from?: string, to?: string) {
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
      if (row.url) {
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
      urlDetails: [...urls.values()].sort((a, b) => b.activeSeconds - a.activeSeconds),
      daily: [...daily.entries()].map(([localDate, activeSeconds]) => ({ localDate, activeSeconds })),
      browsers: [...browsers.values()].sort((a, b) => b.activeSeconds - a.activeSeconds),
    };
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
