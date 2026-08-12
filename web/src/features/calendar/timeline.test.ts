import { describe, expect, it } from 'vitest';
import {
  assignOverlapLane,
  gridTimestampFromPoint,
  formatRangeLabel,
  intervalToRect,
  isArrangeableTask,
  isSameLocalDay,
  itemSpansDay,
  localDayIndex,
  localMinutesSinceMidnight,
  snapTimestamp,
  shiftAnchor,
  timestampToX,
  timelineItemColor,
  visibleRange,
  xToTimestamp,
} from './timeline';

describe('timeline math', () => {
  const from = new Date('2026-08-10T00:00:00.000Z');

  it('round-trips timestamps at each zoom', () => {
    for (const zoom of ['DAY', 'WEEK', 'MONTH'] as const) {
      const timestamp = new Date('2026-08-10T12:30:00.000Z');
      expect(xToTimestamp(timestampToX(timestamp, from, zoom), from, zoom).getTime()).toBe(timestamp.getTime());
    }
  });

  it('snaps day/week/month to 15m/1h/1d', () => {
    expect(snapTimestamp(new Date('2026-08-10T10:08:00Z'), 'DAY').toISOString()).toBe('2026-08-10T10:15:00.000Z');
    expect(snapTimestamp(new Date('2026-08-10T10:31:00Z'), 'WEEK').toISOString()).toBe('2026-08-10T11:00:00.000Z');
    const monthSnap = snapTimestamp(new Date('2026-08-10T10:31:00Z'), 'MONTH');
    expect(monthSnap.getDate()).toBe(10);
    expect(monthSnap.getHours()).toBe(0);
  });

  it('keeps short intervals discoverable and separates overlaps', () => {
    expect(intervalToRect('2026-08-10T10:00:00Z', '2026-08-10T10:01:00Z', from, 'MONTH').width).toBe(16);
    expect(
      assignOverlapLane([
        { startAt: '2026-08-10T10:00:00Z', endAt: '2026-08-10T11:00:00Z' },
        { startAt: '2026-08-10T10:30:00Z', endAt: '2026-08-10T11:30:00Z' },
        { startAt: '2026-08-10T11:30:00Z', endAt: '2026-08-10T12:00:00Z' },
      ]),
    ).toEqual([0, 1, 0]);
  });

  it('only offers undated planned and in-progress tasks for arranging', () => {
    expect(isArrangeableTask({ status: 'PLANNED' })).toBe(true);
    expect(isArrangeableTask({ status: 'IN_PROGRESS' })).toBe(true);
    expect(isArrangeableTask({ status: 'INBOX' })).toBe(false);
    expect(isArrangeableTask({ status: 'COMPLETED' })).toBe(false);
    expect(isArrangeableTask({ status: 'PLANNED', dueAt: '2026-08-10T12:00:00Z' })).toBe(false);
    expect(isArrangeableTask({ status: 'IN_PROGRESS', scheduledStartAt: '2026-08-10T12:00:00Z' })).toBe(false);
  });

  it('uses local week and month boundaries', () => {
    expect(visibleRange(new Date('2026-08-12T15:00:00'), 'WEEK').from.getDay()).toBe(1);
    expect(visibleRange(new Date('2026-08-12T15:00:00'), 'MONTH').from.getDate()).toBe(1);
  });

  it('moves month anchors by calendar month, not a fixed number of days', () => {
    expect(shiftAnchor(new Date('2026-01-31T12:00:00'), 'MONTH', 1).getMonth()).toBe(1);
    expect(shiftAnchor(new Date('2026-08-12T12:00:00'), 'WEEK', -1).getDate()).toBe(5);
  });

  it('labels the active range at each zoom', () => {
    const week = visibleRange(new Date('2026-08-12T15:00:00'), 'WEEK');
    expect(formatRangeLabel(week, 'WEEK', 'en-US')).toBe('Aug 10 – Aug 16, 2026');
    expect(formatRangeLabel(visibleRange(new Date('2026-08-12T15:00:00'), 'DAY'), 'DAY', 'en-US')).toBe(
      'Wednesday, Aug 12, 2026',
    );
    expect(formatRangeLabel(visibleRange(new Date('2026-08-12T15:00:00'), 'MONTH'), 'MONTH', 'en-US')).toBe(
      'August 2026',
    );
  });

  it('highlights local days and keeps event colors truthful', () => {
    expect(isSameLocalDay('2026-08-12T00:05:00', '2026-08-12T23:55:00')).toBe(true);
    expect(isSameLocalDay('2026-08-12T23:55:00', '2026-08-13T00:05:00')).toBe(false);
    expect(timelineItemColor('EXTERNAL_EVENT', '#ef8354')).toBe('#ef8354');
    expect(timelineItemColor('FOCUS_SESSION')).toBe('#8b6fc9');
    expect(timelineItemColor('TASK_DUE')).toBe('var(--itu-amber-500)');
    expect(timelineItemColor('TASK_DURATION', 'ROSE')).toBe('#e11d48');
    expect(timelineItemColor('TASK_DURATION', 'EMERALD')).toBe('#059669');
  });

  it('detects multi-day task overlaps correctly', () => {
    const item = {
      startAt: '2026-08-14T23:00:00.000',
      endAt: '2026-08-15T03:00:00.000',
    };
    expect(itemSpansDay(item, new Date('2026-08-14T00:00:00'))).toBe(true);
    expect(itemSpansDay(item, new Date('2026-08-15T00:00:00'))).toBe(true);
    expect(itemSpansDay(item, new Date('2026-08-16T00:00:00'))).toBe(false);
    expect(itemSpansDay(item, new Date('2026-08-13T00:00:00'))).toBe(false);

    const exactMidnight = {
      startAt: '2026-08-14T23:00:00.000',
      endAt: '2026-08-15T00:00:00.000',
    };
    expect(itemSpansDay(exactMidnight, new Date('2026-08-14T00:00:00'))).toBe(true);
    expect(itemSpansDay(exactMidnight, new Date('2026-08-15T00:00:00'))).toBe(false);
  });
});

