import type { ReviewPeriod } from '@core/domain/review/review.types';
import { isSystemExcludedBundleId } from '@core/application/use-cases/usage-validation';

export const DAY_MS = 86_400_000;

export type UsageRow = {
  localDate: Date;
  syncDeviceId: string;
  source: string;
  hour: number;
  bundleId: string;
  displayName: string;
  activeSeconds: number;
  engagedSeconds: number | null;
  pickups: number | null;
  notifications: number | null;
};
export type UsageCounters = {
  activeSeconds: number;
  engagedSeconds: number | null;
  pickups: number | null;
  notifications: number | null;
};
export type WebsiteSummaryRow = {
  localDate: Date;
  syncDeviceId: string;
  source: string;
  hour: number;
  browserBundleId: string | null;
  hostname: string;
  urlKey: string;
  activeSeconds: number;
};
export type WebsiteSessionRow = { installationId: string; startedAt: Date } & Omit<WebsiteReviewRow, 'source' | 'localDate'>;
export type WebsiteReviewRow = {
  source: string;
  localDate: string;
  hostname: string;
  pageTitle?: string | null;
  activeSeconds: number;
};
export type HealthSummaryRow = {
  localDate: Date;
  syncDeviceId: string;
  updatedAt: Date;
  steps: number;
  walkingRunningDistanceMeters: number;
  activeEnergyKcal: number;
  exerciseMinutes: number;
  standHours: number | null;
  sleepMinutes: number | null;
  restingHeartRateBpm: number | null;
  hrvMilliseconds: number | null;
  workoutCount: number;
  workoutMinutes: number;
  workoutEnergyKcal: number;
};
export type HealthWorkoutRow = { healthKitUUID: string; startedAt: Date };

export function coverage(dates: Array<Date | null>, period: ReviewPeriod) {
  const expectedDays = dateDistance(period.startDate, period.endDate) + 1;
  const coveredDays = new Set(
    dates
      .filter((date): date is Date => date instanceof Date)
      .map((date) => localDateKey(date, period.timezone))
      .filter((date) => date >= period.startDate && date <= period.endDate),
  ).size;
  return { available: coveredDays > 0, coveredDays, expectedDays };
}

export function dateOnlyCoverage(dates: string[], period: ReviewPeriod) {
  const expectedDays = dateDistance(period.startDate, period.endDate) + 1;
  const covered = new Set(dates.filter((date) => date >= period.startDate && date <= period.endDate)).size;
  return { available: covered > 0, coveredDays: covered, expectedDays };
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function localDateKey(date: Date, timezone: string): string {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function emptyUsageCounters(): UsageCounters {
  return { activeSeconds: 0, engagedSeconds: null, pickups: null, notifications: null };
}

export function addUsageRow(
  target: UsageCounters,
  row: Pick<UsageRow, 'activeSeconds' | 'engagedSeconds' | 'pickups' | 'notifications'>,
) {
  target.activeSeconds += row.activeSeconds;
  for (const field of ['engagedSeconds', 'pickups', 'notifications'] as const) {
    const value = row[field];
    if (value === null || value === undefined) continue;
    target[field] = (target[field] ?? 0) + value;
  }
}

export function usageCounters(rows: UsageRow[]): UsageCounters {
  const result = emptyUsageCounters();
  for (const row of rows) addUsageRow(result, row);
  return result;
}

export function distinctUsageRows(rows: UsageRow[]): UsageRow[] {
  const distinct = new Map<string, UsageRow>();
  for (const row of rows) {
    if (isSystemExcludedBundleId(row.bundleId)) continue;
    distinct.set(
      `${row.source}\u0000${row.syncDeviceId}\u0000${dateKey(row.localDate)}\u0000${row.hour}\u0000${row.bundleId}`,
      row,
    );
  }
  return [...distinct.values()];
}

export function sourceTotals(rows: UsageRow[]) {
  const totals = new Map<string, UsageCounters>();
  for (const row of rows) {
    const current = totals.get(row.source) ?? emptyUsageCounters();
    addUsageRow(current, row);
    totals.set(row.source, current);
  }
  return Object.fromEntries(totals);
}

export function selectWebsiteRows(
  summaries: WebsiteSummaryRow[],
  sessions: WebsiteSessionRow[],
  timezone: string,
): WebsiteReviewRow[] {
  const distinct = new Map<string, WebsiteSummaryRow>();
  for (const summary of summaries) {
    distinct.set(
      `${summary.source}\u0000${summary.syncDeviceId}\u0000${dateKey(summary.localDate)}\u0000${summary.hour}\u0000${summary.browserBundleId ?? ''}\u0000${summary.urlKey}`,
      summary,
    );
  }
  const summaryRows = [...distinct.values()].map((summary) => ({
    source: summary.source,
    localDate: dateKey(summary.localDate),
    hostname: summary.hostname,
    activeSeconds: summary.activeSeconds,
  }));
  const devices = new Set(
    summaries.map((summary) =>
      summary.source === 'BROWSER' ? `${dateKey(summary.localDate)}\0${summary.syncDeviceId}` : '',
    ),
  );
  const fallbackRows = sessions
    .map((session) => ({
      installationId: session.installationId,
      source: 'BROWSER',
      localDate: localDateKey(session.startedAt, timezone),
      hostname: session.hostname,
      pageTitle: session.pageTitle,
      activeSeconds: session.activeSeconds,
    }))
    .filter((session) => !devices.has(`${session.localDate}\0browser-${session.installationId}`));
  return [...summaryRows, ...fallbackRows];
}

export function sourceWebsiteTotals(rows: WebsiteReviewRow[]) {
  return Object.fromEntries(
    rows.reduce((totals, row) => {
      const total = totals.get(row.source) ?? { activeSeconds: 0 };
      total.activeSeconds += row.activeSeconds;
      totals.set(row.source, total);
      return totals;
    }, new Map<string, { activeSeconds: number }>()),
  );
}

export function canonicalHealthRows(rows: HealthSummaryRow[]): HealthSummaryRow[] {
  const canonical = new Map<string, HealthSummaryRow>();
  for (const row of rows) {
    const key = dateKey(row.localDate);
    const current = canonical.get(key);
    if (
      !current ||
      row.updatedAt > current.updatedAt ||
      (row.updatedAt.getTime() === current.updatedAt.getTime() && row.syncDeviceId < current.syncDeviceId)
    ) {
      canonical.set(key, row);
    }
  }
  return [...canonical.values()];
}

export function distinctHealthWorkoutRows(rows: HealthWorkoutRow[]): HealthWorkoutRow[] {
  const distinct = new Map<string, HealthWorkoutRow>();
  for (const row of rows) {
    const current = distinct.get(row.healthKitUUID);
    if (!current || row.startedAt < current.startedAt) distinct.set(row.healthKitUUID, row);
  }
  return [...distinct.values()];
}

export function aggregateHealth(rows: HealthSummaryRow[], workoutCount: number) {
  return {
    available: rows.length > 0 || workoutCount > 0,
    steps: rows.length ? sum(rows.map((row) => row.steps)) : null,
    walkingRunningDistanceMeters: rows.length ? sum(rows.map((row) => row.walkingRunningDistanceMeters)) : null,
    activeEnergyKcal: rows.length ? sum(rows.map((row) => row.activeEnergyKcal)) : null,
    exerciseMinutes: rows.length ? sum(rows.map((row) => row.exerciseMinutes)) : null,
    standHours: nullableSum(rows.map((row) => row.standHours)),
    sleepMinutes: nullableSum(rows.map((row) => row.sleepMinutes)),
    restingHeartRateBpm: nullableAverage(rows.map((row) => row.restingHeartRateBpm)),
    hrvMilliseconds: nullableAverage(rows.map((row) => row.hrvMilliseconds)),
    workoutCount: rows.length ? sum(rows.map((row) => row.workoutCount)) : null,
    workouts: workoutCount,
    workoutMinutes: rows.length ? sum(rows.map((row) => row.workoutMinutes)) : null,
    workoutEnergyKcal: rows.length ? sum(rows.map((row) => row.workoutEnergyKcal)) : null,
  };
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function nullableSum(values: Array<number | null>): number | null {
  const measured = values.filter((value): value is number => value !== null);
  return measured.length ? sum(measured) : null;
}

export function nullableAverage(values: Array<number | null>): number | null {
  const measured = values.filter((value): value is number => value !== null);
  return measured.length ? sum(measured) / measured.length : null;
}

export function dateDistance(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS);
}

export function countBy<T>(values: T[], key: (value: T) => string) {
  return values.reduce<Record<string, number>>((counts, value) => {
    const name = key(value);
    counts[name] = (counts[name] ?? 0) + 1;
    return counts;
  }, {});
}

export function groupHabitDetails(habits: Array<{ status: string; habit: { name: string; targetValue: number } }>) {
  return habits.reduce<Record<string, { scheduled: number; completed: number; failed: number; skipped: number }>>(
    (result, occurrence) => {
      const current = result[occurrence.habit.name] ?? { scheduled: 0, completed: 0, failed: 0, skipped: 0 };
      current.scheduled += 1;
      if (occurrence.status === 'COMPLETED') current.completed += 1;
      if (occurrence.status === 'FAILED') current.failed += 1;
      if (occurrence.status === 'SKIPPED') current.skipped += 1;
      result[occurrence.habit.name] = current;
      return result;
    },
    {},
  );
}

export function journalContext(
  entries: Array<{
    entryDate: Date;
    title: string;
    contentMarkdown: string;
    kind: string;
    tags: Array<{ tag: { name: string } }>;
  }>,
) {
  const totalEntries = entries.length;
  const maxCharacters = 40_000;
  let usedCharacters = 0;
  const includedEntries = entries.filter((entry) => {
    const size = entry.title.length + entry.contentMarkdown.length;
    if (usedCharacters + size > maxCharacters) return false;
    usedCharacters += size;
    return true;
  });
  return {
    truncated: includedEntries.length !== totalEntries,
    includedEntries: includedEntries.length,
    totalEntries,
    entries: includedEntries.map((entry) => ({
      date: entry.entryDate,
      title: entry.title,
      tags: entry.tags.map(({ tag }) => tag.name),
      contentMarkdown: entry.contentMarkdown,
      kind: entry.kind,
    })),
  };
}

