import type { GrowthSkill, GrowthStatistics, StudyCalendarDay, UsageSummary } from '@/shared/api/types';
import type { WebsiteActivitySession, WebsiteUsageSummary } from '@/shared/api/usageApi';
import { isSelectableGrowthEntry } from '@/shared/growthEntryFilters';

export interface StatisticsDateRange {
  from: string;
  to: string;
}

export interface TrendPoint {
  key: string;
  label: string;
  completedTasks: number;
  focusedMinutes: number;
  xp: number;
}

export interface UsageTrendPoint {
  key: string;
  label: string;
  activeSeconds: number;
}

export interface UsageStackPoint {
  key: string;
  label: string;
  [series: string]: string | number;
}

export interface WebsiteUsageSlice {
  hostname: string;
  activeSeconds: number;
}

export type WebsitePrivacyFilter = 'all' | 'normal' | 'private';

export interface WebsiteUrlView {
  url: string;
  hostname: string;
  activeSeconds: number;
  latestTitle: string | null;
  isPrivate: boolean;
  visitCount: number;
}

export function selectWebsiteUsageSlices(
  summary: { hostnames?: WebsiteUsageSlice[]; topHostnames: WebsiteUsageSlice[] } | undefined,
  limit = 7,
): WebsiteUsageSlice[] {
  const domains = [...(summary?.hostnames ?? summary?.topHostnames ?? [])]
    .map((domain) => ({ hostname: domain.hostname, activeSeconds: finiteNumber(domain.activeSeconds) }))
    .filter((domain) => domain.activeSeconds > 0)
    .sort((a, b) => b.activeSeconds - a.activeSeconds || a.hostname.localeCompare(b.hostname));
  const top = domains.slice(0, limit);
  const otherSeconds = domains.slice(limit).reduce((total, domain) => total + domain.activeSeconds, 0);
  return otherSeconds > 0 ? [...top, { hostname: 'Other', activeSeconds: otherSeconds }] : top;
}

export function filterWebsiteSessions(sessions: WebsiteActivitySession[], filter: WebsitePrivacyFilter) {
  if (filter === 'all') return sessions;
  return sessions.filter((session) => session.isPrivate === (filter === 'private'));
}

export function websiteDomains(
  summary: WebsiteUsageSummary | undefined,
  sessions: WebsiteActivitySession[],
  search: string,
): WebsiteUsageSlice[] {
  const query = search.trim().toLocaleLowerCase();
  const totals = new Map<string, number>();
  sessions.forEach((session) => totals.set(session.hostname, (totals.get(session.hostname) ?? 0) + finiteNumber(session.activeSeconds)));
  const visibleDetailKeys = new Set(
    sessions
      .filter((session) => session.url)
      .map((session) => `${session.hostname}\u0000${session.url}\u0000${session.isPrivate ? 'private' : 'normal'}`),
  );
  return [...totals.entries()]
    .filter(([hostname]) => {
      if (!query) return true;
      return (
        hostname.toLocaleLowerCase().includes(query) ||
        summary?.urlDetails.some(
          (detail) =>
            visibleDetailKeys.has(`${detail.hostname}\u0000${detail.url}\u0000${detail.isPrivate ? 'private' : 'normal'}`) &&
            detail.hostname === hostname &&
            `${detail.latestTitle ?? ''} ${detail.url}`.toLocaleLowerCase().includes(query),
        )
      );
    })
    .map(([hostname, activeSeconds]) => ({ hostname, activeSeconds }))
    .sort((a, b) => b.activeSeconds - a.activeSeconds || a.hostname.localeCompare(b.hostname));
}

export function websiteUrls(
  summary: WebsiteUsageSummary | undefined,
  sessions: WebsiteActivitySession[],
  hostname: string | null,
  search: string,
): WebsiteUrlView[] {
  if (!summary || !hostname) return [];
  const query = search.trim().toLocaleLowerCase();
  const matchingSessions = sessions.filter((session) => session.hostname === hostname && session.url);
  const visibleDetailKeys = new Set(
    matchingSessions.map((session) => `${session.url}\u0000${session.isPrivate ? 'private' : 'normal'}`),
  );
  return summary.urlDetails
    .filter(
      (detail) =>
        detail.hostname === hostname &&
        visibleDetailKeys.has(`${detail.url}\u0000${detail.isPrivate ? 'private' : 'normal'}`),
    )
    .map((detail) => {
      const visits = matchingSessions.filter(
        (session) => session.url === detail.url && session.isPrivate === detail.isPrivate,
      );
      return {
        ...detail,
        visitCount: visits.length,
        activeSeconds: visits.length > 0 ? visits.reduce((total, visit) => total + visit.activeSeconds, 0) : detail.activeSeconds,
      };
    })
    .filter((detail) => {
      if (!query) return true;
      return `${detail.hostname} ${detail.url} ${detail.latestTitle ?? ''}`.toLocaleLowerCase().includes(query);
    })
    .sort((a, b) => b.activeSeconds - a.activeSeconds || a.url.localeCompare(b.url));
}

export function engagementPercent(totalActiveSeconds: number, totalEngagedSeconds?: number) {
  if (!Number.isFinite(totalEngagedSeconds) || !Number.isFinite(totalActiveSeconds) || totalActiveSeconds <= 0) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round((Math.max(0, totalEngagedSeconds ?? 0) / totalActiveSeconds) * 100)));
}

export function buildUsageTrendData(
  summary: UsageSummary | undefined,
  range: StatisticsDateRange,
  grouping?: 'DAY' | 'WEEK' | 'MONTH',
  showZeroValueSeries = true,
): UsageTrendPoint[] {
  const bucket = bucketMode(range, grouping);
  const daily = new Map((summary?.daily ?? []).map((point) => [point.localDate, finiteNumber(point.activeSeconds)]));
  const points = new Map<string, UsageTrendPoint>();

  for (const date of enumerateDates(range)) {
    const key = bucketKey(date, range.from, bucket);
    if (!points.has(key)) {
      points.set(key, {
        key,
        label: bucketLabel(date, bucket),
        activeSeconds: 0,
      });
    }
    const point = points.get(key);
    if (point) {
      point.activeSeconds += daily.get(date) ?? 0;
    }
  }

  const result = [...points.values()];
  if (!showZeroValueSeries) {
    return result.filter((p) => p.activeSeconds > 0);
  }
  return result;
}

export function selectTopUsageApps(summary: UsageSummary | undefined, limit = 5) {
  return [...(summary?.topApps ?? [])]
    .map((app) => ({ ...app, activeSeconds: finiteNumber(app.activeSeconds) }))
    .filter((app) => app.activeSeconds > 0)
    .sort((a, b) => b.activeSeconds - a.activeSeconds || a.displayName.localeCompare(b.displayName))
    .slice(0, limit);
}

export function buildUsageStackData(
  summary: UsageSummary | undefined,
  range: StatisticsDateRange,
  apps: UsageSummary['topApps'],
): UsageStackPoint[] {
  const selectedHourlyApps = (summary?.hourlyApps ?? []).filter((app) => app.localDate === range.from);
  const totals = new Map((summary?.daily ?? []).map((day) => [day.localDate, finiteNumber(day.activeSeconds)]));
  const dailyApps = new Map(
    (summary?.dailyApps ?? []).map((app) => [`${app.localDate}\u0000${app.bundleId}`, finiteNumber(app.activeSeconds)]),
  );
  if (range.from === range.to) {
    const hourlyApps = new Map(
      selectedHourlyApps.map((app) => [
        `${app.localDate}\u0000${app.hour}\u0000${app.bundleId}`,
        finiteNumber(app.activeSeconds),
      ]),
    );
    const hourlyByBundle = new Map<string, number>();
    selectedHourlyApps.forEach((app) =>
      hourlyByBundle.set(app.bundleId, (hourlyByBundle.get(app.bundleId) ?? 0) + finiteNumber(app.activeSeconds)),
    );
    const hourlyTotal = selectedHourlyApps.reduce((total, app) => total + finiteNumber(app.activeSeconds), 0);
    const legacyTotal = Math.max(0, (totals.get(range.from) ?? 0) - hourlyTotal);
    const fallbackHour = new Date().getHours();
    return Array.from({ length: 24 }, (_, hour) => {
      const point: UsageStackPoint = {
        key: `${range.from}-${hour}`,
        label: `${String(hour).padStart(2, '0')}:00`,
      };
      let shownSeconds = 0;
      apps.forEach((app, index) => {
        const legacySeconds = Math.max(
          0,
          (dailyApps.get(`${range.from}\u0000${app.bundleId}`) ?? 0) - (hourlyByBundle.get(app.bundleId) ?? 0),
        );
        const seconds =
          (hourlyApps.get(`${range.from}\u0000${hour}\u0000${app.bundleId}`) ?? 0) +
          (hour === fallbackHour ? legacySeconds : 0);
        point[`app${index}`] = seconds;
        shownSeconds += seconds;
      });
      const totalSeconds = selectedHourlyApps
        .filter((app) => app.hour === hour)
        .reduce((total, app) => total + finiteNumber(app.activeSeconds), hour === fallbackHour ? legacyTotal : 0);
      point.other = Math.max(0, totalSeconds - shownSeconds);
      return point;
    });
  }

  return enumerateDates(range).map((date) => {
    const point: UsageStackPoint = { key: date, label: bucketLabel(date, 'day') };
    let shownSeconds = 0;
    apps.forEach((app, index) => {
      const seconds = dailyApps.get(`${date}\u0000${app.bundleId}`) ?? 0;
      point[`app${index}`] = seconds;
      shownSeconds += seconds;
    });
    point.other = Math.max(0, (totals.get(date) ?? 0) - shownSeconds);
    return point;
  });
}

export function selectTopAttributes(skills: GrowthSkill[]) {
  return skills
    .filter((skill) => skill.kind === 'ATTRIBUTE' && isSelectableGrowthEntry(skill))
    .sort((a, b) => b.level - a.level || b.currentXp - a.currentXp || a.name.localeCompare(b.name))
    .slice(0, 5);
}

export function summarizeActivity(days: StudyCalendarDay[]) {
  return days.reduce(
    (summary, day) => ({
      completedTasks: summary.completedTasks + finiteNumber(day.completedTasks),
      focusSessions: summary.focusSessions + finiteNumber(day.focusSessions),
      focusedMinutes: summary.focusedMinutes + finiteNumber(day.focusedMinutes),
      reviewSessions: summary.reviewSessions + finiteNumber(day.sessions),
      reviews: summary.reviews + finiteNumber(day.reviews),
      cardsCreated: summary.cardsCreated + finiteNumber(day.cardsCreated),
    }),
    {
      completedTasks: 0,
      focusSessions: 0,
      focusedMinutes: 0,
      reviewSessions: 0,
      reviews: 0,
      cardsCreated: 0,
    },
  );
}

export function filterActivityRange(days: StudyCalendarDay[], range: StatisticsDateRange) {
  return days.filter((day) => day.date >= range.from && day.date <= range.to);
}

export function buildTrendData(
  days: StudyCalendarDay[],
  growth: GrowthStatistics | undefined,
  range: StatisticsDateRange,
  grouping?: 'DAY' | 'WEEK' | 'MONTH',
  showZeroValueSeries = true,
): TrendPoint[] {
  const bucket = bucketMode(range, grouping);
  const points = new Map<string, TrendPoint>();

  for (const date of enumerateDates(range)) {
    const key = bucketKey(date, range.from, bucket);
    if (!points.has(key)) {
      points.set(key, {
        key,
        label: bucketLabel(date, bucket),
        completedTasks: 0,
        focusedMinutes: 0,
        xp: 0,
      });
    }
  }

  for (const day of filterActivityRange(days, range)) {
    const key = bucketKey(day.date, range.from, bucket);
    const point = points.get(key);
    if (!point) continue;
    point.completedTasks += finiteNumber(day.completedTasks);
    point.focusedMinutes += finiteNumber(day.focusedMinutes);
  }

  for (const entry of growth?.trend ?? []) {
    if (entry.date < range.from || entry.date > range.to) continue;
    const key = bucketKey(entry.date, range.from, bucket);
    const point = points.get(key);
    if (point) point.xp += entry.xp;
  }

  const result = [...points.values()];
  if (!showZeroValueSeries) {
    return result.filter((p) => p.completedTasks > 0 || p.focusedMinutes > 0 || p.xp > 0);
  }
  return result;
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function dateRangeForDays(days: number, today = new Date()): StatisticsDateRange {
  const to = new Date(today);
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  return { from: localDateKey(from), to: localDateKey(to) };
}

export function inclusiveDayCount(range: StatisticsDateRange) {
  return Math.floor((parseDateKey(range.to).getTime() - parseDateKey(range.from).getTime()) / 86_400_000) + 1;
}

export function rangeLabel(range: StatisticsDateRange) {
  const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${formatter.format(parseDateKey(range.from))} – ${formatter.format(parseDateKey(range.to))}`;
}

function bucketMode(range: StatisticsDateRange, grouping?: 'DAY' | 'WEEK' | 'MONTH'): 'day' | 'week' | 'month' {
  if (grouping === 'DAY') return 'day';
  if (grouping === 'WEEK') return 'week';
  if (grouping === 'MONTH') return 'month';
  const days = inclusiveDayCount(range);
  if (days <= 31) return 'day';
  if (days <= 180) return 'week';
  return 'month';
}

function bucketKey(dateKey: string, rangeStart: string, mode: 'day' | 'week' | 'month') {
  if (mode === 'day') return dateKey;
  if (mode === 'month') return dateKey.slice(0, 7);
  const offset = Math.floor((parseDateKey(dateKey).getTime() - parseDateKey(rangeStart).getTime()) / 86_400_000 / 7);
  return `week-${offset}`;
}

function bucketLabel(dateKey: string, mode: 'day' | 'week' | 'month') {
  const date = parseDateKey(dateKey);
  return date.toLocaleDateString(
    undefined,
    mode === 'month' ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' },
  );
}

function enumerateDates(range: StatisticsDateRange) {
  const dates: string[] = [];
  const cursor = parseDateKey(range.from);
  const end = parseDateKey(range.to);
  while (cursor <= end) {
    dates.push(localDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}
