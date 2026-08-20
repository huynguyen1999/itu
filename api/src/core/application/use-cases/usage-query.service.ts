import type { IUsageRepository } from '@core/application/ports/out/repositories.port';
import { InvalidRequestException } from '@core/domain/exceptions';
import { DEFAULT_USAGE_PREFERENCES } from './preferences.service';
import {
  dateKey,
  getLocalDayBounds,
  isSystemExcludedBundleId,
  localDateFor,
  nextDay,
  parseDate,
  unionIntervals,
  validTimezone,
} from './usage-validation';
import type {
  ScreenTimeAppStatistic,
  ScreenTimeDailyAppStatistic,
  ScreenTimeDailyBucket,
  ScreenTimeDeviceSummary,
  ScreenTimeHourlyAppStatistic,
  ScreenTimeHourlyBucket,
  ScreenTimeStatisticsResponse,
} from './usage.types';

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
    if (start > end) throw new InvalidRequestException('from must not be after to');
    if ((end.getTime() - start.getTime()) / 86_400_000 + 1 > 365) throw new InvalidRequestException('Usage date range cannot exceed 365 days');

    const fromDateStr = from ?? dateKey(start);
    const toDateStr = to ?? dateKey(end);

    const rows = await this.usage.findSummaries(userId, start, nextDay(end), deviceId);

    let screenTimeStats: ScreenTimeStatisticsResponse | null = null;
    if (typeof this.usage.findScreenTimeEvents === 'function') {
      try {
        screenTimeStats = await this.getScreenTimeStatistics(userId, fromDateStr, toDateStr, deviceId);
      } catch {
        screenTimeStats = null;
      }
    }

    const daily = new Map<string, { activeSeconds: number; engagedSeconds: number; hasEngaged: boolean }>();
    const dailyApps = new Map<string, { localDate: string; bundleId: string; displayName: string; activeSeconds: number; engagedSeconds: number; hasEngaged: boolean }>();
    const apps = new Map<string, { bundleId: string; displayName: string; activeSeconds: number; engagedSeconds: number; hasEngaged: boolean; iconHash?: string | null; iconStorageKey?: string | null; iconUrl?: string | null }>();
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

    if (screenTimeStats && screenTimeStats.screenTimeSeconds > 0) {
      if (rows.length === 0) {
        totalActiveSeconds = screenTimeStats.screenTimeSeconds;
      } else {
        totalActiveSeconds += screenTimeStats.screenTimeSeconds;
      }

      for (const d of screenTimeStats.dailyScreenTime) {
        const existing = daily.get(d.localDate) ?? { activeSeconds: 0, engagedSeconds: 0, hasEngaged: false };
        existing.activeSeconds += d.screenTimeSeconds;
        daily.set(d.localDate, existing);
      }

      for (const da of screenTimeStats.dailyApps) {
        const key = `${da.localDate}\u0000${da.bundleId}`;
        const existing = dailyApps.get(key) ?? { localDate: da.localDate, bundleId: da.bundleId, displayName: da.displayName, activeSeconds: 0, engagedSeconds: 0, hasEngaged: false };
        existing.activeSeconds += da.activeSeconds;
        if (!existing.displayName && da.displayName) existing.displayName = da.displayName;
        dailyApps.set(key, existing);
      }

      for (const ha of screenTimeStats.hourlyApps) {
        const key = `${ha.localDate}\u0000${ha.hour}\u0000${ha.bundleId}`;
        const existing = hourlyApps.get(key) ?? { localDate: ha.localDate, hour: ha.hour, bundleId: ha.bundleId, displayName: ha.displayName, activeSeconds: 0, engagedSeconds: 0, hasEngaged: false };
        existing.activeSeconds += ha.activeSeconds;
        if (!existing.displayName && ha.displayName) existing.displayName = ha.displayName;
        hourlyApps.set(key, existing);
      }

      for (const a of screenTimeStats.apps) {
        const existing = apps.get(a.bundleId) ?? { bundleId: a.bundleId, displayName: a.displayName, activeSeconds: 0, engagedSeconds: 0, hasEngaged: false };
        existing.activeSeconds += a.activeSeconds;
        if (!existing.displayName && a.displayName) existing.displayName = a.displayName;
        if (!existing.iconHash && a.iconHash) existing.iconHash = a.iconHash;
        if (a.iconUrl && !existing.iconUrl) existing.iconUrl = a.iconUrl;
        apps.set(a.bundleId, existing);
      }
    }

    const hasAnyObserved = observedActiveSeconds > 0;
    return {
      from: fromDateStr,
      to: toDateStr,
      totalActiveSeconds,
      totalEngagedSeconds: hasAnyObserved ? totalEngagedSeconds : undefined,
      engagementCoverage: { observedActiveSeconds, totalActiveSeconds, complete: totalActiveSeconds > 0 && observedActiveSeconds === totalActiveSeconds },
      topApps: [...apps.values()].sort((a, b) => b.activeSeconds - a.activeSeconds).map((a) => ({ bundleId: a.bundleId, displayName: a.displayName, activeSeconds: a.activeSeconds, ...(a.hasEngaged ? { engagedSeconds: a.engagedSeconds } : {}), ...(a.iconUrl ? { iconUrl: a.iconUrl } : this.iconResponse(a.iconHash, a.iconStorageKey)) })),
      daily: [...daily.entries()].map(([localDate, val]) => ({ localDate, activeSeconds: val.activeSeconds, engagedSeconds: val.hasEngaged ? val.engagedSeconds : undefined })),
      dailyApps: [...dailyApps.values()].map((a) => ({ localDate: a.localDate, bundleId: a.bundleId, displayName: a.displayName, activeSeconds: a.activeSeconds, engagedSeconds: a.hasEngaged ? a.engagedSeconds : undefined })),
      hourlyApps: [...hourlyApps.values()].map((a) => ({ localDate: a.localDate, hour: a.hour, bundleId: a.bundleId, displayName: a.displayName, activeSeconds: a.activeSeconds, engagedSeconds: a.hasEngaged ? a.engagedSeconds : undefined })),
    };
  }

  async getScreenTimeStatistics(
    userId: string,
    from?: string,
    to?: string,
    deviceId?: string,
    timezone = 'Asia/Ho_Chi_Minh',
  ): Promise<ScreenTimeStatisticsResponse> {
    const tz = validTimezone(timezone) ? timezone : 'Asia/Ho_Chi_Minh';
    const today = new Date();
    const defaultTo = localDateFor(today, tz);
    const retentionDays = from || to
      ? DEFAULT_USAGE_PREFERENCES.retentionDays
      : (await this.usage.getTrackingPreferences(userId)).retentionDays;
    const defaultFromDate = new Date(today.getTime() - (retentionDays - 1) * 86_400_000);
    const defaultFrom = localDateFor(defaultFromDate, tz);

    const fromDateStr = from || defaultFrom;
    const toDateStr = to || defaultTo;

    const start = parseDate(fromDateStr, 'from');
    const end = parseDate(toDateStr, 'to');
    if (start > end) throw new InvalidRequestException('from must not be after to');
    if ((end.getTime() - start.getTime()) / 86_400_000 + 1 > 365) {
      throw new InvalidRequestException('Usage date range cannot exceed 365 days');
    }

    const fromBounds = getLocalDayBounds(fromDateStr, tz);
    const toBounds = getLocalDayBounds(toDateStr, tz);
    const queryStart = fromBounds.start;
    const queryEnd = toBounds.end;

    const [allEvents, discoveredDevices] = await Promise.all([
      this.usage.findScreenTimeEvents(userId, queryStart, queryEnd, deviceId),
      this.usage.listScreenTimeDevices(userId),
    ]);

    const validEvents = allEvents.filter(
      (e) => !isSystemExcludedBundleId(e.bundleId) && e.startedAt < e.endedAt,
    );

    // Compute device breakdown
    const eventsByDevice = new Map<string, typeof validEvents>();
    for (const e of validEvents) {
      const list = eventsByDevice.get(e.sourceDeviceId) ?? [];
      list.push(e);
      eventsByDevice.set(e.sourceDeviceId, list);
    }

    const deviceSummaries: ScreenTimeDeviceSummary[] = discoveredDevices.map((d) => {
      const devEvents = eventsByDevice.get(d.deviceId) ?? [];
      const devUnion = unionIntervals(devEvents);
      const totalSec = devUnion.reduce((acc, i) => acc + i.durationSeconds, 0);
      return {
        deviceId: d.deviceId,
        name: d.name,
        platform: d.platform,
        screenTimeSeconds: totalSec,
      };
    });

    // Determine devices in scope
    const targetDeviceIds = deviceId && deviceId !== 'all'
      ? [deviceId]
      : discoveredDevices.map((d) => d.deviceId);

    // Compute device unions (within each device, overlapping intervals are unioned)
    const deviceUnions = new Map<string, ReturnType<typeof unionIntervals>>();
    for (const dId of targetDeviceIds) {
      const devEvents = eventsByDevice.get(dId) ?? [];
      deviceUnions.set(dId, unionIntervals(devEvents));
    }

    // Headline Screen Time: sum of device screen times across target scope
    let totalScreenTimeSeconds = 0;
    for (const dId of targetDeviceIds) {
      const devUnion = deviceUnions.get(dId) ?? [];
      totalScreenTimeSeconds += devUnion.reduce((acc, i) => acc + i.durationSeconds, 0);
    }

    // Compute hourly Screen Time and daily Screen Time (accumulated across devices)
    const hourlyScreenTime: ScreenTimeHourlyBucket[] = [];
    const dailyScreenTime: ScreenTimeDailyBucket[] = [];

    // If single day query, compute 24 hourly buckets
    if (fromDateStr === toDateStr) {
      for (let h = 0; h < 24; h += 1) {
        const hourStart = new Date(fromBounds.start.getTime() + h * 3_600_000);
        const hourEnd = new Date(fromBounds.start.getTime() + (h + 1) * 3_600_000);
        let hourSec = 0;
        for (const dId of targetDeviceIds) {
          const devUnion = deviceUnions.get(dId) ?? [];
          for (const interval of devUnion) {
            const s = Math.max(hourStart.getTime(), interval.startedAt.getTime());
            const e = Math.min(hourEnd.getTime(), interval.endedAt.getTime());
            if (e > s) {
              hourSec += Math.floor((e - s) / 1000);
            }
          }
        }
        hourlyScreenTime.push({
          hour: h,
          screenTimeSeconds: hourSec,
        });
      }
    }

    // Daily buckets
    let dayCursor = new Date(start.getTime());
    while (dayCursor <= end) {
      const dayStr = dateKey(dayCursor);
      const dayBounds = getLocalDayBounds(dayStr, tz);
      let daySec = 0;
      for (const dId of targetDeviceIds) {
        const devUnion = deviceUnions.get(dId) ?? [];
        for (const interval of devUnion) {
          const s = Math.max(dayBounds.start.getTime(), interval.startedAt.getTime());
          const e = Math.min(dayBounds.end.getTime(), interval.endedAt.getTime());
          if (e > s) {
            daySec += Math.floor((e - s) / 1000);
          }
        }
      }
      dailyScreenTime.push({
        localDate: dayStr,
        screenTimeSeconds: daySec,
      });
      dayCursor = nextDay(dayCursor);
    }

    // Compute Per-App Statistics (union within each device, then accumulate across devices)
    const scopeEvents = deviceId && deviceId !== 'all'
      ? (eventsByDevice.get(deviceId) ?? [])
      : validEvents;

    const eventsByAppAndDevice = new Map<string, Map<string, typeof validEvents>>();
    const appIdentities = new Map<string, { displayName: string; iconHash?: string | null; iconStorageKey?: string | null }>();
    for (const e of scopeEvents) {
      let devMap = eventsByAppAndDevice.get(e.bundleId);
      if (!devMap) {
        devMap = new Map();
        eventsByAppAndDevice.set(e.bundleId, devMap);
      }
      const list = devMap.get(e.sourceDeviceId) ?? [];
      list.push(e);
      devMap.set(e.sourceDeviceId, list);

      if (!appIdentities.has(e.bundleId)) {
        appIdentities.set(e.bundleId, {
          displayName: e.displayName,
          iconHash: e.iconHash,
          iconStorageKey: e.iconStorageKey,
        });
      }
    }

    const apps: ScreenTimeAppStatistic[] = [];
    const hourlyApps: ScreenTimeHourlyAppStatistic[] = [];
    const dailyApps: ScreenTimeDailyAppStatistic[] = [];

    for (const [bundleId, devMap] of eventsByAppAndDevice) {
      let activeSeconds = 0;
      const appUnionsByDevice = new Map<string, ReturnType<typeof unionIntervals>>();
      for (const [dId, dEvents] of devMap) {
        const dUnion = unionIntervals(dEvents);
        appUnionsByDevice.set(dId, dUnion);
        activeSeconds += dUnion.reduce((acc, i) => acc + i.durationSeconds, 0);
      }

      const identity = appIdentities.get(bundleId);

      apps.push({
        bundleId,
        displayName: identity?.displayName || bundleId,
        activeSeconds,
        ...(identity?.iconHash ? { iconHash: identity.iconHash } : {}),
        ...(identity?.iconStorageKey ? { iconUrl: `/media/${identity.iconStorageKey}` } : {}),
      });

      // If single day, compute hourly apps
      if (fromDateStr === toDateStr) {
        for (let h = 0; h < 24; h += 1) {
          const hourStart = new Date(fromBounds.start.getTime() + h * 3_600_000);
          const hourEnd = new Date(fromBounds.start.getTime() + (h + 1) * 3_600_000);
          let hourSec = 0;
          for (const dUnion of appUnionsByDevice.values()) {
            for (const interval of dUnion) {
              const s = Math.max(hourStart.getTime(), interval.startedAt.getTime());
              const e = Math.min(hourEnd.getTime(), interval.endedAt.getTime());
              if (e > s) {
                hourSec += Math.floor((e - s) / 1000);
              }
            }
          }
          if (hourSec > 0) {
            hourlyApps.push({
              localDate: fromDateStr,
              hour: h,
              bundleId,
              displayName: identity?.displayName || bundleId,
              activeSeconds: hourSec,
            });
          }
        }
      }

      // Daily apps
      let dCursor = new Date(start.getTime());
      while (dCursor <= end) {
        const dayStr = dateKey(dCursor);
        const dayBounds = getLocalDayBounds(dayStr, tz);
        let daySec = 0;
        for (const dUnion of appUnionsByDevice.values()) {
          for (const interval of dUnion) {
            const s = Math.max(dayBounds.start.getTime(), interval.startedAt.getTime());
            const e = Math.min(dayBounds.end.getTime(), interval.endedAt.getTime());
            if (e > s) {
              daySec += Math.floor((e - s) / 1000);
            }
          }
        }
        if (daySec > 0) {
          dailyApps.push({
            localDate: dayStr,
            bundleId,
            displayName: identity?.displayName || bundleId,
            activeSeconds: daySec,
          });
        }
        dCursor = nextDay(dCursor);
      }
    }

    apps.sort((a, b) => b.activeSeconds - a.activeSeconds);

    const firstEventAt = validEvents.length > 0
      ? new Date(Math.min(...validEvents.map((e) => e.startedAt.getTime()))).toISOString()
      : null;
    const lastEventAt = validEvents.length > 0
      ? new Date(Math.max(...validEvents.map((e) => e.endedAt.getTime()))).toISOString()
      : null;

    return {
      from: fromDateStr,
      to: toDateStr,
      timezone: tz,
      selectedDeviceScope: deviceId || 'all',
      screenTimeSeconds: totalScreenTimeSeconds,
      hourlyScreenTime,
      dailyScreenTime,
      apps,
      hourlyApps,
      dailyApps,
      devices: deviceSummaries,
      coverage: {
        intervalCount: validEvents.length,
        firstEventAt,
        lastEventAt,
      },
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
