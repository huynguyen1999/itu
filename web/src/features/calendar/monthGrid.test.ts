import { describe, expect, it } from 'vitest';
import {
  MAX_VISIBLE_MONTH_LANES,
  clipToWeek,
  layoutMonthWeek,
  monthGridDays,
  monthGridRange,
  resolveFirstDayOfWeek,
  semanticMonthRange,
} from './monthGrid';

const day = (y: number, m: number, d: number, h = 0) => new Date(y, m, d, h);
const item = (id: string, start: Date, end: Date) => ({ id, start, end });

describe('monthGridRange', () => {
  it('gives a 5-row grid for a Sunday-start month', () => {
    const range = monthGridRange(day(2026, 1, 10), 0);
    expect(range.weeks).toBe(5);
    expect(range.from).toEqual(day(2026, 1, 1));
    expect(range.to).toEqual(day(2026, 2, 8));
  });

  it('gives a 6-row grid for August 2026 with Sunday start', () => {
    const range = monthGridRange(day(2026, 7, 12), 0);
    expect(range.weeks).toBe(6);
    expect(range.from).toEqual(day(2026, 6, 26)); // Jul 26
    expect(range.to).toEqual(day(2026, 8, 6)); // Sep 6 exclusive
  });

  it('gives a 6-row grid for August 2026 with Monday start', () => {
    const range = monthGridRange(day(2026, 7, 12), 1);
    expect(range.weeks).toBe(6);
    expect(range.from).toEqual(day(2026, 6, 27)); // Jul 27
  });

  it('keeps 5 rows for February 2026 with Monday start', () => {
    const range = monthGridRange(day(2026, 1, 10), 1);
    expect(range.weeks).toBe(5);
  });
});

describe('monthGridDays', () => {
  it('produces 7-column weeks with adjacent month cells', () => {
    const days = monthGridDays(day(2026, 7, 12), 0);
    expect(days).toHaveLength(42);
    expect(days[0].getMonth()).toBe(6); // July (previous month)
    expect(days[0].getDate()).toBe(26);
    expect(days[41].getMonth()).toBe(8); // September (next month)
    expect(days[41].getDate()).toBe(5);
  });
});

describe('resolveFirstDayOfWeek', () => {
  it('honors explicit overrides', () => {
    expect(resolveFirstDayOfWeek('SUNDAY')).toBe(0);
    expect(resolveFirstDayOfWeek('MONDAY')).toBe(1);
  });
  it('falls back to Sunday for SYSTEM', () => {
    expect([0, 1]).toContain(resolveFirstDayOfWeek('SYSTEM'));
  });
});

describe('semanticMonthRange', () => {
  it('ranges over the semantic month only', () => {
    const range = semanticMonthRange(day(2026, 7, 12));
    expect(range.from).toEqual(day(2026, 7, 1));
    expect(range.to).toEqual(day(2026, 8, 1));
  });
});

describe('clipToWeek', () => {
  const weekStart = day(2026, 8, 9); // Sunday

  it('clips a midnight-crossing duration into two days', () => {
    const span = clipToWeek(item('a', day(2026, 8, 10, 23), day(2026, 8, 11, 3)), weekStart);
    expect(span).toEqual({ dayStart: 1, dayEnd: 2 });
  });

  it('treats an exact-midnight end as the previous day', () => {
    const span = clipToWeek(item('a', day(2026, 8, 10, 23), day(2026, 8, 11, 0)), weekStart);
    expect(span).toEqual({ dayStart: 1, dayEnd: 2 });
  });

  it('returns null when the item is outside the week', () => {
    expect(clipToWeek(item('a', day(2026, 9, 1), day(2026, 9, 2)), weekStart)).toBeNull();
  });
});

describe('layoutMonthWeek', () => {
  const weekStart = day(2026, 8, 9);

  it('lays out zero items', () => {
    const layout = layoutMonthWeek([], weekStart);
    expect(layout.segments).toEqual([]);
    expect(layout.hiddenCounts).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('puts 1–3 items into visible lanes', () => {
    const layout = layoutMonthWeek(
      [
        item('a', day(2026, 8, 9, 9), day(2026, 8, 9, 10)),
        item('b', day(2026, 8, 9, 10), day(2026, 8, 9, 11)),
        item('c', day(2026, 8, 10, 9), day(2026, 8, 10, 10)),
      ],
      weekStart,
    );
    expect(layout.segments.map((segment) => segment.lane)).toEqual([0, 1, 0]);
    expect(layout.hiddenCounts).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('counts lanes beyond the cap as hidden', () => {
    const layout = layoutMonthWeek(
      [
        item('a', day(2026, 8, 9, 9), day(2026, 8, 9, 10)),
        item('b', day(2026, 8, 9, 10), day(2026, 8, 9, 11)),
        item('c', day(2026, 8, 9, 11), day(2026, 8, 9, 12)),
        item('d', day(2026, 8, 9, 12), day(2026, 8, 9, 13)),
        item('e', day(2026, 8, 9, 13), day(2026, 8, 9, 14)),
      ],
      weekStart,
    );
    expect(layout.hiddenCounts[0]).toBe(2);
    expect(layout.segments.filter((segment) => segment.lane >= MAX_VISIBLE_MONTH_LANES)).toHaveLength(2);
  });

  it('spans a multi-day task across its days in one lane', () => {
    const layout = layoutMonthWeek(
      [item('a', day(2026, 8, 10, 23), day(2026, 8, 11, 3)), item('b', day(2026, 8, 10, 9), day(2026, 8, 10, 10))],
      weekStart,
    );
    const span = layout.segments.find((segment) => segment.id === 'a');
    expect(span).toEqual({ id: 'a', dayStart: 1, dayEnd: 2, lane: 0 });
  });

  it('sorts by start day then longest span', () => {
    const layout = layoutMonthWeek(
      [
        item('short', day(2026, 8, 11, 9), day(2026, 8, 11, 10)),
        item('long', day(2026, 8, 11, 9), day(2026, 8, 13, 10)),
        item('earlier', day(2026, 8, 10, 9), day(2026, 8, 10, 10)),
      ],
      weekStart,
    );
    expect(layout.segments.map((segment) => segment.id)).toEqual(['earlier', 'long', 'short']);
    expect(layout.segments.find((segment) => segment.id === 'long')?.lane).toBe(0);
  });
});
