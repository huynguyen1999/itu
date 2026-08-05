import type { GrowthSkill, GrowthStatistics, StudyCalendarDay } from '@/shared/api/types';
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
): TrendPoint[] {
  const bucket = bucketMode(range);
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

  return [...points.values()];
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

function bucketMode(range: StatisticsDateRange): 'day' | 'week' | 'month' {
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
