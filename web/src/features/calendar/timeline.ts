export type TimelineZoom = 'DAY' | 'WEEK' | 'MONTH';
export type TimelineItemKind = 'TASK_DURATION' | 'TASK_DUE' | 'FOCUS_SESSION' | 'EXTERNAL_EVENT';

export const CALENDAR_DAY_WIDTH = 180;
export const CALENDAR_HOUR_HEIGHT = 60;
export const CALENDAR_ALL_DAY_HEIGHT = 38;

export function formatRangeLabel(
  range: { from: Date; to: Date },
  zoom: TimelineZoom,
  locale = undefined as string | undefined,
): string {
  if (zoom === 'MONTH') return range.from.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  if (zoom === 'DAY') {
    return range.from.toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  }
  const lastDay = new Date(range.to);
  lastDay.setDate(lastDay.getDate() - 1);
  const fromLabel = range.from.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  const toLabel = lastDay.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fromLabel} – ${toLabel}`;
}

export function isSameLocalDay(first: Date | string, second: Date | string): boolean {
  const left = new Date(first);
  const right = new Date(second);
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function toDayNumber(timestamp: Date | string): number {
  const d = new Date(timestamp);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function getEffectiveEndDayNumber(startAt: Date | string, endAt?: Date | string | null): number {
  if (!endAt) return toDayNumber(startAt);
  const end = new Date(endAt);
  const start = new Date(startAt);
  if (end.getTime() <= start.getTime()) return toDayNumber(startAt);

  if (end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0 && end.getMilliseconds() === 0) {
    const prev = new Date(end.getTime() - 1);
    return toDayNumber(prev);
  }
  return toDayNumber(end);
}

export function itemSpansDay(
  item: { startAt: Date | string; endAt?: Date | string | null },
  targetDate: Date | string,
): boolean {
  const startDay = toDayNumber(item.startAt);
  if (Number.isNaN(startDay)) return false;

  const endDay = getEffectiveEndDayNumber(item.startAt, item.endAt);
  const targetDay = toDayNumber(targetDate);

  return targetDay >= startDay && targetDay <= endDay;
}




export function timelineItemColor(kind: TimelineItemKind, sourceColor?: string | null): string {
  if (sourceColor) {
    if (sourceColor.startsWith('#') || sourceColor.startsWith('var(') || sourceColor.startsWith('rgb')) return sourceColor;
    const semanticColors: Record<string, string> = {
      TEAL: 'var(--itu-teal-600)',
      BLUE: '#4f8fcf',
      AMBER: 'var(--itu-amber-500)',
      CORAL: 'var(--itu-coral-500)',
      ROSE: '#e11d48',
      EMERALD: '#059669',
      VIOLET: '#8b6fc9',
      FOCUS: '#8b6fc9',
    };
    if (semanticColors[sourceColor]) return semanticColors[sourceColor];
  }
  if (kind === 'FOCUS_SESSION') return '#8b6fc9';
  if (kind === 'TASK_DUE') return 'var(--itu-amber-500)';
  return 'var(--itu-teal-600)';
}

export function visibleRange(anchor: Date, zoom: TimelineZoom, firstDayOfWeek: 0 | 1 = 1): { from: Date; to: Date } {
  const from = new Date(anchor);
  from.setHours(0, 0, 0, 0);
  if (zoom === 'DAY') {
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from, to };
  }
  if (zoom === 'WEEK') {
    const day = from.getDay();
    const offset = (day - firstDayOfWeek + 7) % 7;
    from.setDate(from.getDate() - offset);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { from, to };
  }
  from.setDate(1);
  const to = new Date(from);
  to.setMonth(to.getMonth() + 1);
  return { from, to };
}

export function shiftAnchor(anchor: Date, zoom: TimelineZoom, direction: -1 | 1): Date {
  const next = new Date(anchor);
  if (zoom === 'MONTH') {
    // Clamp to the first day before changing month so Jan 31 → Feb (not Mar).
    next.setDate(1);
    next.setMonth(next.getMonth() + direction);
  }
  else next.setDate(next.getDate() + direction * (zoom === 'DAY' ? 1 : 7));
  return next;
}

export function localDayIndex(timestamp: Date | string, rangeStart: Date): number {
  const target = new Date(timestamp);
  const start = new Date(rangeStart);
  start.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  let index = 0;
  while (start < target) {
    start.setDate(start.getDate() + 1);
    index += 1;
  }
  while (start > target) {
    start.setDate(start.getDate() - 1);
    index -= 1;
  }
  return index;
}

export function localMinutesSinceMidnight(timestamp: Date | string): number {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

export function gridTimestampFromPoint(
  x: number,
  y: number,
  rangeStart: Date,
  dayWidth = CALENDAR_DAY_WIDTH,
  hourHeight = CALENDAR_HOUR_HEIGHT,
  allDayHeight = CALENDAR_ALL_DAY_HEIGHT,
): Date {
  const dayIndex = Math.max(0, Math.floor(x / dayWidth));
  const minutes = Math.max(0, Math.min(24 * 60 - 1, ((y - allDayHeight) / hourHeight) * 60));
  const date = new Date(rangeStart);
  date.setDate(date.getDate() + dayIndex);
  date.setHours(Math.floor(minutes / 60), Math.round(minutes % 60), 0, 0);
  return date;
}

export function pixelsPerHour(zoom: TimelineZoom): number {
  return zoom === 'DAY' ? 96 : zoom === 'WEEK' ? 24 : 8;
}

export function timestampToX(timestamp: Date | string, from: Date, zoom: TimelineZoom): number {
  return ((new Date(timestamp).getTime() - from.getTime()) / 3_600_000) * pixelsPerHour(zoom);
}

export function xToTimestamp(x: number, from: Date, zoom: TimelineZoom): Date {
  return new Date(from.getTime() + (x / pixelsPerHour(zoom)) * 3_600_000);
}

export function snapTimestamp(timestamp: Date, zoom: TimelineZoom): Date {
  const minutes = zoom === 'DAY' ? 15 : zoom === 'WEEK' ? 60 : 24 * 60;
  const next = new Date(timestamp);
  next.setMinutes(Math.round(next.getMinutes() / minutes) * minutes, 0, 0);
  if (minutes === 24 * 60) next.setHours(0, 0, 0, 0);
  return next;
}

export function isArrangeableTask(task: {
  status?: string | null;
  dueAt?: string | null;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
}): boolean {
  return (
    (task.status === 'PLANNED' || task.status === 'IN_PROGRESS') &&
    !task.dueAt &&
    !task.scheduledStartAt &&
    !task.scheduledEndAt
  );
}

export function intervalToRect(
  startAt: Date | string,
  endAt: Date | string,
  from: Date,
  zoom: TimelineZoom,
  minimumWidth = 16,
) {
  const left = timestampToX(startAt, from, zoom);
  const right = timestampToX(endAt, from, zoom);
  return { left, width: Math.max(minimumWidth, right - left) };
}

export function assignOverlapLane(
  items: Array<{ startAt: string; endAt?: string | null; left?: number; width?: number }>,
  minHorizontalGap: number = 0,
): number[] {
  const bounds = items.map((item) => {
    if (item.left !== undefined && item.width !== undefined) {
      return { left: item.left, right: item.left + item.width };
    }
    const start = new Date(item.startAt).getTime();
    const end = item.endAt ? new Date(item.endAt).getTime() : start + 30 * 60_000;
    return { left: start, right: Math.max(start + 30 * 60_000, end) };
  });

  const indices = items
    .map((_, i) => i)
    .sort((a, b) => bounds[a].left - bounds[b].left || bounds[a].right - bounds[b].right);

  const lanes: number[] = new Array(items.length).fill(0);
  const laneEnds: number[] = [];

  indices.forEach((index) => {
    const { left, right } = bounds[index];
    let lane = laneEnds.findIndex((end) => end + minHorizontalGap <= left);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(right);
    } else {
      laneEnds[lane] = right;
    }
    lanes[index] = lane;
  });

  return lanes;
}

export function computeDynamicItemTops(
  items: Array<{ left: number; width: number; height: number }>,
  lanes: number[],
  baseTop: number = 10,
  gap: number = 7,
  minHorizontalGap: number = 0,
): { tops: number[]; maxBottom: number } {
  const count = items.length;
  const tops: number[] = new Array(count).fill(baseTop);

  const indices = items.map((_, i) => i).sort((a, b) => lanes[a] - lanes[b]);

  indices.forEach((i) => {
    const laneI = lanes[i];
    const leftI = items[i].left;
    const rightI = items[i].left + items[i].width;

    let maxY = baseTop;
    for (let j = 0; j < count; j++) {
      if (lanes[j] < laneI) {
        const leftJ = items[j].left;
        const rightJ = items[j].left + items[j].width;
        if (leftI < rightJ + minHorizontalGap && rightI + minHorizontalGap > leftJ) {
          const bottomJ = tops[j] + items[j].height + gap;
          if (bottomJ > maxY) {
            maxY = bottomJ;
          }
        }
      }
    }
    tops[i] = maxY;
  });

  const maxBottom = tops.reduce((max, top, i) => Math.max(max, top + items[i].height), baseTop);
  return { tops, maxBottom };
}

export function formatSingleTime(dateInput: Date | string): string {
  const date = new Date(dateInput);
  const hour = date.getHours();
  const min = date.getMinutes();
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const formattedHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${formattedHour}:${min.toString().padStart(2, '0')} ${ampm}`;
}
