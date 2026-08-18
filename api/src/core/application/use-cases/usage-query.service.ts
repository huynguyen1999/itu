import { BadRequestException } from '@nestjs/common';
import type { IUsageRepository } from '@core/application/ports/out/repositories.port';
import { DEFAULT_USAGE_PREFERENCES } from './preferences.service';
import { dateKey, isSystemExcludedBundleId, nextDay, parseDate } from './usage-validation';

/** Read-only usage reporting use cases. */
export class UsageQueryService {
  constructor(protected readonly usage: IUsageRepository) {}

  async getSummaries(userId: string, from?: string, to?: string, deviceId?: string) {
    const today = new Date();
    const defaultTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const retentionDays = from || to ? DEFAULT_USAGE_PREFERENCES.retentionDays : (await this.usage.getTrackingPreferences(userId)).retentionDays;
    const defaultFrom = new Date(defaultTo.getTime() - (retentionDays - 1) * 86_400_000);
    const start = from ? parseDate(from, 'from') : defaultFrom;
    const end = to ? parseDate(to, 'to') : defaultTo;
    if (start > end) throw new BadRequestException('from must not be after to');
    if ((end.getTime() - start.getTime()) / 86_400_000 + 1 > 365) throw new BadRequestException('Usage date range cannot exceed 365 days');

    const rows = await this.usage.findSummaries(userId, start, nextDay(end), deviceId);
    const daily = new Map<string, { activeSeconds: number; engagedSeconds: number; hasEngaged: boolean }>();
    const dailyApps = new Map<string, { localDate: string; bundleId: string; displayName: string; activeSeconds: number; engagedSeconds: number; hasEngaged: boolean }>();
    const apps = new Map<string, { bundleId: string; displayName: string; activeSeconds: number; engagedSeconds: number; hasEngaged: boolean; iconHash?: string | null; iconStorageKey?: string | null }>();
    const hourlyApps = new Map<string, { localDate: string; hour: number; bundleId: string; displayName: string; activeSeconds: number; engagedSeconds: number; hasEngaged: boolean }>();
    let totalActiveSeconds = 0;
    let totalEngagedSeconds = 0;
    let observedActiveSeconds = 0;
    for (const row of rows) {
      if (isSystemExcludedBundleId(row.bundleId)) continue;
      const day = dateKey(row.localDate);
      const hasEngaged = row.engagedSeconds !== null && row.engagedSeconds !== undefined;
      const engaged = row.engagedSeconds ?? 0;
      totalActiveSeconds += row.activeSeconds;
      if (hasEngaged) { totalEngagedSeconds += engaged; observedActiveSeconds += row.activeSeconds; }
      const d = daily.get(day) ?? { activeSeconds: 0, engagedSeconds: 0, hasEngaged: false };
      d.activeSeconds += row.activeSeconds;
      if (hasEngaged) { d.engagedSeconds += engaged; d.hasEngaged = true; }
      daily.set(day, d);
      const dailyAppKey = `${day}\u0000${row.bundleId}`;
      const dailyApp = dailyApps.get(dailyAppKey) ?? { localDate: day, bundleId: row.bundleId, displayName: row.displayName, activeSeconds: 0, engagedSeconds: 0, hasEngaged: false };
      dailyApp.activeSeconds += row.activeSeconds;
      if (hasEngaged) { dailyApp.engagedSeconds += engaged; dailyApp.hasEngaged = true; }
      dailyApps.set(dailyAppKey, dailyApp);
      if (row.hour >= 0 && row.hour <= 23) {
        const hourlyAppKey = `${day}\u0000${row.hour}\u0000${row.bundleId}`;
        const hourlyApp = hourlyApps.get(hourlyAppKey) ?? { localDate: day, hour: row.hour, bundleId: row.bundleId, displayName: row.displayName, activeSeconds: 0, engagedSeconds: 0, hasEngaged: false };
        hourlyApp.activeSeconds += row.activeSeconds;
        if (hasEngaged) { hourlyApp.engagedSeconds += engaged; hourlyApp.hasEngaged = true; }
        hourlyApps.set(hourlyAppKey, hourlyApp);
      }
      const app = apps.get(row.bundleId) ?? { bundleId: row.bundleId, displayName: row.displayName, activeSeconds: 0, engagedSeconds: 0, hasEngaged: false };
      app.activeSeconds += row.activeSeconds;
      if (hasEngaged) { app.engagedSeconds += engaged; app.hasEngaged = true; }
      if (!app.displayName && row.displayName) app.displayName = row.displayName;
      if (!app.iconHash && row.iconHash) app.iconHash = row.iconHash;
      if (!app.iconStorageKey && row.iconStorageKey) app.iconStorageKey = row.iconStorageKey;
      apps.set(row.bundleId, app);
    }
    const hasAnyObserved = observedActiveSeconds > 0;
    return {
      from: dateKey(start),
      to: dateKey(end),
      totalActiveSeconds,
      totalEngagedSeconds: hasAnyObserved ? totalEngagedSeconds : undefined,
      engagementCoverage: { observedActiveSeconds, totalActiveSeconds, complete: totalActiveSeconds > 0 && observedActiveSeconds === totalActiveSeconds },
      topApps: [...apps.values()].sort((a, b) => b.activeSeconds - a.activeSeconds).map((a) => ({ bundleId: a.bundleId, displayName: a.displayName, activeSeconds: a.activeSeconds, ...(a.hasEngaged ? { engagedSeconds: a.engagedSeconds } : {}), ...this.iconResponse(a.iconHash, a.iconStorageKey) })),
      daily: [...daily.entries()].map(([localDate, val]) => ({ localDate, activeSeconds: val.activeSeconds, engagedSeconds: val.hasEngaged ? val.engagedSeconds : undefined })),
      dailyApps: [...dailyApps.values()].map((a) => ({ localDate: a.localDate, bundleId: a.bundleId, displayName: a.displayName, activeSeconds: a.activeSeconds, engagedSeconds: a.hasEngaged ? a.engagedSeconds : undefined })),
      hourlyApps: [...hourlyApps.values()].map((a) => ({ localDate: a.localDate, hour: a.hour, bundleId: a.bundleId, displayName: a.displayName, activeSeconds: a.activeSeconds, engagedSeconds: a.hasEngaged ? a.engagedSeconds : undefined })),
    };
  }

  async getAppIdentities(userId: string) {
    const identities = await this.usage.listAppIdentities(userId);
    return identities.map((identity) => ({ bundleId: identity.bundleId, displayName: identity.displayName, ...this.iconResponse(identity.iconHash, identity.iconStorageKey) }));
  }

  protected iconResponse(iconHash?: string | null, iconStorageKey?: string | null) {
    return { ...(iconHash ? { iconHash } : {}), ...(iconStorageKey ? { iconUrl: `/media/${iconStorageKey}` } : {}) };
  }
}
