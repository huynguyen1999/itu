export type WeekStart = 'SYSTEM' | 'SUNDAY' | 'MONDAY';
export const MAX_VISIBLE_MONTH_LANES = 3;

export interface DaySpan {
  start: Date;
  end: Date;
}

export interface WeekSegment {
  id: string;
  dayStart: number; // 0..6 within the week
  dayEnd: number; // exclusive, 1..7
  lane: number;
}

export interface WeekLayout {
  weekStart: Date;
  segments: WeekSegment[];
  hiddenCounts: number[]; // per day index 0..6
}

export function resolveFirstDayOfWeek(pref: WeekStart, locale = undefined as string | undefined): 0 | 1 {
  if (pref === 'SUNDAY') return 0;
  if (pref === 'MONDAY') return 1;
  try {
    const localeObj = new Intl.Locale(locale ?? Intl.DateTimeFormat().resolvedOptions().locale);
    const weekInfo = (localeObj as { getWeekInfo?: () => { firstDay: number } }).getWeekInfo?.();
    const firstDay = weekInfo?.firstDay;
    if (firstDay === 7) return 0;
    if (firstDay === 1) return 1;
  } catch {
    // fall through to Sunday
  }
  return 0;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

/** Semantic month range: first day of month → first day of next month. */
export function semanticMonthRange(anchor: Date): { from: Date; to: Date } {
  const from = new Date(anchor);
  from.setHours(0, 0, 0, 0);
  from.setDate(1);
  const to = new Date(from);
  to.setMonth(to.getMonth() + 1);
  return { from, to };
}

/** Grid range: week-aligned 5/6-row range covering the semantic month. */
export function monthGridRange(anchor: Date, firstDayOfWeek: 0 | 1): { from: Date; to: Date; weeks: number } {
  const semantic = semanticMonthRange(anchor);
  const from = startOfDay(semantic.from);
  const offset = (from.getDay() - firstDayOfWeek + 7) % 7;
  from.setDate(from.getDate() - offset);
  const totalDays = 35 + (offset + semanticDaysInMonth(anchor) > 35 ? 7 : 0);
  const to = new Date(from);
  to.setDate(to.getDate() + totalDays);
  return { from, to, weeks: totalDays / 7 };
}

function semanticDaysInMonth(anchor: Date): number {
  const from = semanticMonthRange(anchor).from;
  return new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
}

/** All day cells of the month grid, oldest → newest. */
export function monthGridDays(anchor: Date, firstDayOfWeek: 0 | 1): Date[] {
  const { from, weeks } = monthGridRange(anchor, firstDayOfWeek);
  const days: Date[] = [];
  for (let index = 0; index < weeks * 7; index += 1) {
    const day = new Date(from);
    day.setDate(day.getDate() + index);
    days.push(day);
  }
  return days;
}

function dayOffset(date: Date, weekStart: Date): number {
  const target = startOfDay(date);
  const base = startOfDay(weekStart);
  return Math.round((target.getTime() - base.getTime()) / 86_400_000);
}

/** Exclusive-day end of a span: exact midnight ends count as the previous day. */
function effectiveEndDay(end: Date): Date {
  if (end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0 && end.getMilliseconds() === 0) {
    return new Date(end.getTime() - 1);
  }
  return end;
}

/**
 * Clip an item to a week and return its day range within the week, or null when
 * the item does not touch the week at all.
 */
export function clipToWeek(item: DaySpan, weekStart: Date): { dayStart: number; dayEnd: number } | null {
  const start = startOfDay(item.start);
  const end = effectiveEndDay(item.end);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const s = start < weekStart ? weekStart : start;
  const e = end > weekEnd ? weekEnd : end;
  if (e <= s) return null;
  const dayStart = dayOffset(s, weekStart);
  let dayEnd = dayOffset(e, weekStart);
  if (dayEnd <= dayStart) dayEnd = dayStart + 1;
  return { dayStart: Math.max(0, dayStart), dayEnd: Math.min(7, Math.max(dayEnd, dayStart + 1)) };
}

/**
 * Lane layout for one week row. Sorts by start day, then longest span, then id.
 * Lanes >= MAX_VISIBLE_MONTH_LANES are counted as hidden per covered day.
 */
export function layoutMonthWeek(items: Array<DaySpan & { id: string }>, weekStart: Date): WeekLayout {
  const clipped: Array<{ id: string; dayStart: number; dayEnd: number }> = [];
  for (const item of items) {
    const span = clipToWeek(item, weekStart);
    if (span) clipped.push({ id: item.id, ...span });
  }
  clipped.sort((a, b) => a.dayStart - b.dayStart || (b.dayEnd - b.dayStart) - (a.dayEnd - a.dayStart) || a.id.localeCompare(b.id));

  const laneBusy: boolean[][] = [];
  const segments: WeekSegment[] = [];
  const hiddenCounts = new Array<number>(7).fill(0);

  for (const entry of clipped) {
    let lane = -1;
    for (let candidate = 0; candidate < laneBusy.length; candidate += 1) {
      const busy = laneBusy[candidate];
      let free = true;
      for (let day = entry.dayStart; day < entry.dayEnd && free; day += 1) {
        if (busy[day]) free = false;
      }
      if (free) {
        lane = candidate;
        break;
      }
    }
    if (lane < 0) {
      lane = laneBusy.length;
      laneBusy.push(new Array<boolean>(7).fill(false));
    }
    for (let day = entry.dayStart; day < entry.dayEnd; day += 1) laneBusy[lane][day] = true;
    segments.push({ id: entry.id, dayStart: entry.dayStart, dayEnd: entry.dayEnd, lane });
    if (lane >= MAX_VISIBLE_MONTH_LANES) {
      for (let day = entry.dayStart; day < entry.dayEnd; day += 1) hiddenCounts[day] += 1;
    }
  }

  return { weekStart, segments, hiddenCounts };
}

export function chunkWeeks(days: Date[]): Date[][] {
  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));
  return weeks;
}
