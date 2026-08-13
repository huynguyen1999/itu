import { readFileSync } from 'node:fs';
import path from 'node:path';
import { calculateRelativeReminderAt } from './task-date-rules';
import { CalendarService } from './calendar.service';

type Fixture = {
  version: number;
  timelineRange: { from: string; to: string };
  preferences: { zoom: string; visibleKinds: string[]; showCompleted: boolean; collapsedGroupIds: string[] };
  zoomRanges: Record<string, { anchor: string; from: string; to: string }>;
  tasks: Array<Record<string, any>>;
  focusSessions: Array<Record<string, any>>;
  externalEvents: Array<Record<string, any>>;
  rangeCases: Array<{ id: string; startAt: string; endAt: string; included: boolean }>;
  reminders: Array<{ task: Record<string, string>; input: Record<string, unknown>; expectedRemindAt: string }>;
};

const fixture = JSON.parse(
  readFileSync(path.resolve(process.cwd(), '../fixtures/calendar-semantics-v1.json'), 'utf8'),
) as Fixture;

function sourceEvent(event: Record<string, any>) {
  return {
    id: event.id,
    calendarId: event.calendarId,
    title: event.title,
    startAt: new Date(event.startAt),
    endAt: event.endAt ? new Date(event.endAt) : null,
    allDay: event.allDay,
    status: event.status,
    calendar: event.calendar,
  };
}

function project(item: Record<string, any>) {
  return {
    id: item.id,
    kind: item.kind,
    startAt: new Date(item.startAt).toISOString(),
    endAt: item.endAt ? new Date(item.endAt).toISOString() : null,
    ...(item.kind === 'TASK_DURATION' || item.kind === 'TASK_DUE'
      ? { dueAt: item.dueAt ? new Date(item.dueAt).toISOString() : null }
      : {}),
    allDay: item.allDay,
    readOnly: item.readOnly,
    sourceId: item.sourceId,
    sourceName: item.sourceName,
    color: item.color,
    status: item.status,
    ...(item.priority == null ? {} : { priority: item.priority }),
  };
}

describe('Calendar semantic fixture', () => {
  it('keeps the canonical version, zoom values, and preference semantics', () => {
    expect(fixture.version).toBe(1);
    expect(fixture.preferences).toEqual({
      zoom: 'WEEK',
      visibleKinds: ['TASK_DURATION', 'TASK_DUE', 'FOCUS_SESSION', 'EXTERNAL_EVENT'],
      showCompleted: false,
      collapsedGroupIds: ['project:inbox', 'calendar:calendar-hidden'],
    });
    expect(fixture.zoomRanges.DAY).toMatchObject({
      from: '2026-08-12T00:00:00.000Z',
      to: '2026-08-13T00:00:00.000Z',
    });
    expect(fixture.zoomRanges.WEEK).toMatchObject({
      from: '2026-08-10T00:00:00.000Z',
      to: '2026-08-17T00:00:00.000Z',
    });
    expect(fixture.zoomRanges.MONTH).toMatchObject({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
    });
  });

  it('normalizes task, Focus Session, and visible external cases through CalendarService', async () => {
    const visibleEvents = fixture.externalEvents.filter((event) => event.visible).map(sourceEvent);
    const service = new CalendarService(
      { listTasks: jest.fn().mockResolvedValue({ data: fixture.tasks }) } as any,
      { listFocusSessions: jest.fn().mockResolvedValue(fixture.focusSessions) } as any,
      { listVisibleEvents: jest.fn().mockResolvedValue(visibleEvents) } as any,
    );

    const result = await service.timeline('fixture-user', fixture.timelineRange.from, fixture.timelineRange.to);
    const expected = [...fixture.tasks, ...fixture.focusSessions, ...fixture.externalEvents]
      .filter((item) => item.expected)
      .map((item) => ({ id: item.id, ...item.expected }));

    expect(result.items.map((item) => project(item as Record<string, any>))).toEqual(
      expect.arrayContaining(expected),
    );
    expect(result.items).toHaveLength(expected.length);
    expect(result.items.some((item) => item.id === 'focus-abandoned')).toBe(false);
    expect(result.items.some((item) => item.id === 'event-hidden')).toBe(false);
    expect(fixture.externalEvents.find((event) => event.id === 'event-recurring')?.recurrenceId).toBe('20260812T190000Z');
  });

  it('applies the canonical half-open range boundaries in the repository-facing event set', async () => {
    const from = new Date(fixture.timelineRange.from);
    const to = new Date(fixture.timelineRange.to);
    const rangeEvents = fixture.rangeCases.map((event) => sourceEvent({
      ...event,
      calendarId: 'calendar-visible',
      title: event.id,
      allDay: false,
      status: 'CONFIRMED',
      calendar: { name: 'Work', color: 'CORAL' },
    }));
    const service = new CalendarService(
      { listTasks: jest.fn().mockResolvedValue({ data: [] }) } as any,
      { listFocusSessions: jest.fn().mockResolvedValue([]) } as any,
      {
        listVisibleEvents: jest.fn().mockImplementation(async () => rangeEvents.filter((event) =>
          event.startAt < to && (event.endAt === null || event.endAt > from),
        )),
      } as any,
    );

    const result = await service.timeline('fixture-user', fixture.timelineRange.from, fixture.timelineRange.to);
    const included = fixture.rangeCases.filter((event) => event.included).map((event) => event.id);
    expect(result.items.map((item) => item.id)).toEqual(included);
  });

  it('resolves relative reminders against due and scheduled-start anchors, including DST', () => {
    for (const reminder of fixture.reminders) {
      expect(calculateRelativeReminderAt(reminder.task, reminder.input as any).toISOString()).toBe(reminder.expectedRemindAt);
    }
  });
});
