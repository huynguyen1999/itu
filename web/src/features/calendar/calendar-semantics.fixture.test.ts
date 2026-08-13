import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CalendarTimelineItem } from '@/shared/api/client';
import { groupCalendarItems } from './components/CalendarTimeline';
import {
  timelineItemColor,
  visibleRange,
  type TimelineItemKind,
  type TimelineZoom,
} from './timeline';

type Fixture = {
  version: number;
  timeZone: string;
  zoomRanges: Record<string, { anchor: string; from: string; to: string }>;
  preferences: { zoom: TimelineZoom; visibleKinds: TimelineItemKind[]; showCompleted: boolean; collapsedGroupIds: string[] };
  timelineRange: { from: string; to: string };
  tasks: Array<Record<string, any>>;
  focusSessions: Array<Record<string, any>>;
  externalEvents: Array<Record<string, any>>;
  rangeCases: Array<{ id: string; startAt: string; endAt: string; included: boolean }>;
  reminders: Array<{ input: { relativeTo?: string }; expectedRemindAt: string }>;
};

const fixture = JSON.parse(
  readFileSync(path.resolve(process.cwd(), '../fixtures/calendar-semantics-v1.json'), 'utf8'),
) as Fixture;

// The fixture uses explicit UTC instants so calendar math is independent of the host locale.
process.env.TZ = fixture.timeZone;

function expectedItems(): CalendarTimelineItem[] {
  const taskItems = fixture.tasks.map((task) => ({ id: task.id, ...task.expected }));
  const focusItems = fixture.focusSessions.filter((session) => session.expected).map((session) => ({ id: session.id, ...session.expected }));
  const eventItems = fixture.externalEvents
    .filter((event) => event.visible && event.expected)
    .map((event) => ({ id: event.id, ...event.expected }));
  return [...taskItems, ...focusItems, ...eventItems] as CalendarTimelineItem[];
}

describe('Calendar semantic fixture', () => {
  it('matches the canonical DAY, WEEK, and MONTH ranges', () => {
    expect(fixture.version).toBe(1);
    for (const zoom of ['DAY', 'WEEK', 'MONTH'] as const) {
      const expected = fixture.zoomRanges[zoom];
      const actual = visibleRange(new Date(expected.anchor), zoom);
      expect(actual.from.toISOString()).toBe(expected.from);
      expect(actual.to.toISOString()).toBe(expected.to);
    }
  });

  it('filters completed and hidden-source items, preserves read-only/all-day meaning, and groups sources', () => {
    const items = expectedItems().filter((item) =>
      fixture.preferences.visibleKinds.includes(item.kind) &&
      (fixture.preferences.showCompleted || !item.kind.startsWith('TASK_') || item.status !== 'COMPLETED'),
    );

    expect(items.map((item) => item.id)).toEqual([
      'task-due',
      'task-scheduled',
      'task-separate-due',
      'focus-session',
      'event-all-day',
      'event-timed',
      'event-recurring',
    ]);
    expect(items.find((item) => item.id === 'task-due')).toMatchObject({ kind: 'TASK_DUE', allDay: true, readOnly: false });
    expect(items.find((item) => item.id === 'task-scheduled')).toMatchObject({ kind: 'TASK_DURATION', allDay: false, readOnly: false });
    expect(items.find((item) => item.id === 'focus-session')).toMatchObject({ kind: 'FOCUS_SESSION', allDay: false, readOnly: true });
    expect(items.find((item) => item.id === 'event-all-day')).toMatchObject({ kind: 'EXTERNAL_EVENT', allDay: true, readOnly: true });
    expect(items.find((item) => item.id === 'event-timed')).toMatchObject({ kind: 'EXTERNAL_EVENT', allDay: false, readOnly: true });
    expect(fixture.externalEvents.find((event) => event.id === 'event-hidden')?.visible).toBe(false);
    expect(fixture.externalEvents.find((event) => event.id === 'event-recurring')?.recurrenceId).toBe('20260812T190000Z');

    const groups = groupCalendarItems(items);
    expect(groups.map((group) => group.id)).toEqual([
      'project:inbox',
      'project:project-deep-work',
      'calendar:calendar-visible',
      'focus',
    ]);
    expect(fixture.preferences.collapsedGroupIds).toContain('project:inbox');
    expect(fixture.preferences.collapsedGroupIds).toContain('calendar:calendar-hidden');
    expect(groups.find((group) => group.id === 'calendar:calendar-visible')?.color).toBe('var(--itu-coral-500)');
    expect(timelineItemColor('TASK_DUE')).toBe('var(--itu-amber-500)');
    expect(timelineItemColor('EXTERNAL_EVENT', 'CORAL')).toBe('var(--itu-coral-500)');
  });

  it('keeps the canonical half-open range boundaries and reminder anchors explicit', () => {
    const from = new Date(fixture.timelineRange.from).getTime();
    const to = new Date(fixture.timelineRange.to).getTime();
    const included = fixture.rangeCases
      .filter((event) => new Date(event.startAt).getTime() < to && new Date(event.endAt).getTime() > from)
      .map((event) => event.id);
    expect(included).toEqual(fixture.rangeCases.filter((event) => event.included).map((event) => event.id));
    expect(fixture.reminders.map((reminder) => reminder.input.relativeTo)).toEqual(['DUE_AT', 'SCHEDULE_START_AT', 'DUE_AT']);
    expect(fixture.reminders.map((reminder) => reminder.expectedRemindAt)).toEqual([
      '2026-08-15T13:45:00.000Z',
      '2026-08-15T15:30:00.000Z',
      '2026-03-07T14:00:00.000Z',
    ]);
  });
});
