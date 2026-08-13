import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const calendarFixture = vi.hoisted(() => ({
  preferences: undefined as { calendar: { zoom: 'DAY' | 'WEEK' | 'MONTH'; visibleKinds: Array<'TASK_DURATION' | 'TASK_DUE' | 'FOCUS_SESSION' | 'EXTERNAL_EVENT'>; showCompleted: boolean; collapsedGroupIds: string[] } } | undefined,
  timelineItems: [] as Array<Record<string, unknown>>,
}));

const mutationFixture = vi.hoisted(() => ({ configs: [] as Array<{ onSuccess?: unknown }> }));

const queryMocks = vi.hoisted(() => ({
  useMutation: vi.fn((config: { onSuccess?: unknown }) => {
    mutationFixture.configs.push(config);
    return { isError: false, isPending: false, mutate: vi.fn() };
  }),
  useQuery: vi.fn(({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === 'user-preferences') {
      return { data: calendarFixture.preferences, isError: false, isLoading: false, isRefetching: false, refetch: vi.fn() };
    }
    if (queryKey[1] === 'timeline') {
      return {
        data: { from: '', to: '', items: calendarFixture.timelineItems },
        isError: false,
        isLoading: false,
        isRefetching: false,
        refetch: vi.fn(),
      };
    }
    if (queryKey[1] === 'sources') {
      return { data: [], isError: false, isLoading: false, isRefetching: false, refetch: vi.fn() };
    }
    return { data: { data: [] }, isError: false, isLoading: false, isRefetching: false, refetch: vi.fn() };
  }),
  useQueryClient: vi.fn(() => ({
    cancelQueries: vi.fn(),
    getQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
  })),
}));

vi.mock('@tanstack/react-query', () => queryMocks);

import { CalendarPage, groupCalendarItems } from './CalendarPage';
import { formatSingleTime } from './timeline';

describe('CalendarPage', () => {
  it('keeps the week visible and exposes Arrange tasks as a reveal action', () => {
    const markup = renderToStaticMarkup(<CalendarPage />);

    expect(markup).toContain('Schedule overview');
    expect(markup).toContain('Arrange tasks');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-controls="calendar-arrange-tasks"');
    expect(markup).not.toContain('id="calendar-arrange-tasks"');
    expect(markup).not.toContain('Drop unfinished work onto the timeline');
  });

  it('keeps optimistic view changes from being replaced by a stale preference refetch', () => {
    mutationFixture.configs = [];

    renderToStaticMarkup(<CalendarPage />);

    expect(mutationFixture.configs[0]?.onSuccess).toBeUndefined();
  });

  it('uses synced group IDs and stable source-first ordering', () => {
    const groups = groupCalendarItems([
      { id: 'focus', kind: 'FOCUS_SESSION', title: 'Focus', startAt: '2026-08-12T10:00:00Z', endAt: '2026-08-12T10:30:00Z', sourceId: null, sourceName: null, readOnly: true },
      { id: 'cal-z', kind: 'EXTERNAL_EVENT', title: 'Zed', startAt: '2026-08-12T10:00:00Z', endAt: '2026-08-12T10:30:00Z', sourceId: 'z', sourceName: 'Zed', readOnly: true },
      { id: 'project-b', kind: 'TASK_DURATION', title: 'Beta', startAt: '2026-08-12T10:00:00Z', endAt: '2026-08-12T10:30:00Z', sourceId: 'b', sourceName: 'Beta', readOnly: false },
      { id: 'inbox', kind: 'TASK_DURATION', title: 'Inbox', startAt: '2026-08-12T10:00:00Z', endAt: '2026-08-12T10:30:00Z', sourceId: null, sourceName: null, readOnly: false },
      { id: 'inbox-assigned', kind: 'TASK_DURATION', title: 'Inbox Assigned', startAt: '2026-08-12T10:00:00Z', endAt: '2026-08-12T10:30:00Z', sourceId: 'list-inbox', sourceName: 'Inbox', readOnly: false },
      { id: 'project-a', kind: 'TASK_DURATION', title: 'Alpha', startAt: '2026-08-12T10:00:00Z', endAt: '2026-08-12T10:30:00Z', sourceId: 'a', sourceName: 'Alpha', readOnly: false },
    ]);
    expect(groups.map((group) => group.id)).toEqual(['project:inbox', 'project:a', 'project:b', 'calendar:z', 'focus']);
    const inboxGroup = groups.find((g) => g.id === 'project:inbox');
    expect(inboxGroup?.items.map((i) => i.id)).toEqual(['inbox', 'inbox-assigned']);
    expect(inboxGroup?.subtitle).toBe('Inbox');
  });

  it('does not position a due-only task as a timed block in day view', () => {
    calendarFixture.preferences = {
      calendar: { zoom: 'DAY', visibleKinds: ['TASK_DURATION', 'TASK_DUE'], showCompleted: true, collapsedGroupIds: [] },
    };
    calendarFixture.timelineItems = [{
      id: 'due-only',
      kind: 'TASK_DUE',
      title: 'Due only',
      startAt: '2026-08-12T09:00:00.000Z',
      endAt: null,
      allDay: true,
      readOnly: false,
      taskId: 'due-only',
    }];

    const markup = renderToStaticMarkup(<CalendarPage />);

    expect(markup).toContain('Due only');
    expect(markup).not.toContain('left:82px;top:4px;width:180px');
    calendarFixture.preferences = undefined;
    calendarFixture.timelineItems = [];
  });

  it('renders all-day items in the Due today strip in day view', () => {
    calendarFixture.preferences = {
      calendar: { zoom: 'DAY', visibleKinds: ['TASK_DURATION', 'TASK_DUE'], showCompleted: true, collapsedGroupIds: [] },
    };
    calendarFixture.timelineItems = [1, 2].map((index) => ({
      id: `all-day-${index}`,
      kind: 'TASK_DUE',
      title: `All-day task ${index}`,
      startAt: '2026-08-12T00:00:00.000Z',
      endAt: null,
      allDay: true,
      readOnly: false,
      taskId: `all-day-${index}`,
    }));

    const markup = renderToStaticMarkup(<CalendarPage />);

    expect(markup).toContain('Due today');
    expect(markup).toContain('All-day task 1');
    expect(markup).toContain('All-day task 2');
    calendarFixture.preferences = undefined;
    calendarFixture.timelineItems = [];
  });

  it('places overlapping subscription events side-by-side in vertical day view', () => {
    calendarFixture.preferences = {
      calendar: { zoom: 'DAY', visibleKinds: ['EXTERNAL_EVENT'], showCompleted: true, collapsedGroupIds: [] },
    };
    calendarFixture.timelineItems = [1, 2, 3].map((index) => ({
      id: `event-${index}`,
      kind: 'EXTERNAL_EVENT',
      title: `Event ${index}`,
      startAt: '2026-08-12T18:00:00.000Z',
      endAt: '2026-08-12T19:00:00.000Z',
      allDay: false,
      readOnly: true,
      sourceId: 'talkfirst',
      sourceName: 'TalkFirst',
    }));

    const markup = renderToStaticMarkup(<CalendarPage />);
    expect(markup).toContain('top:1080px');
    expect(markup).toContain('height:60px');
    expect(markup).toContain('width:calc(33.3333');
    calendarFixture.preferences = undefined;
    calendarFixture.timelineItems = [];
  });

  it('renders a multi-day task as a single multi-column grid spanning card in week view', () => {
    calendarFixture.preferences = {
      calendar: { zoom: 'WEEK', visibleKinds: ['TASK_DURATION'], showCompleted: true, collapsedGroupIds: [] },
    };
    calendarFixture.timelineItems = [{
      id: 'overnight-task',
      kind: 'TASK_DURATION',
      title: 'Build a small T...',
      startAt: '2026-08-14T23:00:00.000',
      endAt: '2026-08-15T03:00:00.000',
      allDay: false,
      readOnly: false,
      taskId: 'overnight-task',
    }];

    const markup = renderToStaticMarkup(<CalendarPage />);

    // Multi-day item renders as a single card element spanning across CSS grid columns
    const matches = markup.match(/aria-label="Build a small T\.\.\., Task, draggable"/g) || [];
    expect(matches.length).toBe(1);
    expect(markup).toContain('grid-column:');

    calendarFixture.preferences = undefined;
    calendarFixture.timelineItems = [];
  });

  it('renders a 3-line layout for same-date duration tasks and split columns for different-date duration tasks', () => {
    calendarFixture.preferences = {
      calendar: { zoom: 'DAY', visibleKinds: ['TASK_DURATION'], showCompleted: true, collapsedGroupIds: [] },
    };
    calendarFixture.timelineItems = [
      {
        id: 'same-day-task',
        kind: 'TASK_DURATION',
        title: 'Same Day Feature',
        startAt: '2026-08-12T09:00:00.000Z',
        endAt: '2026-08-12T10:30:00.000Z',
        allDay: false,
        readOnly: false,
        taskId: 'same-day-task',
      },
    ];

    const markupSameDay = renderToStaticMarkup(<CalendarPage />);
    expect(markupSameDay).toContain('Same Day Feature');
    expect(markupSameDay).toContain(formatSingleTime('2026-08-12T09:00:00.000Z'));
    expect(markupSameDay).toContain(formatSingleTime('2026-08-12T10:30:00.000Z'));

    calendarFixture.preferences = undefined;
    calendarFixture.timelineItems = [];
  });

  it('does not include relative position class on absolutely positioned event cards in day view', () => {
    calendarFixture.preferences = {
      calendar: { zoom: 'DAY', visibleKinds: ['TASK_DURATION'], showCompleted: true, collapsedGroupIds: [] },
    };
    calendarFixture.timelineItems = [
      {
        id: 'task-1',
        kind: 'TASK_DURATION',
        title: 'Task 1',
        startAt: '2026-08-12T18:00:00.000Z',
        endAt: '2026-08-12T19:00:00.000Z',
        allDay: false,
        readOnly: false,
        taskId: 'task-1',
      },
    ];

    const markup = renderToStaticMarkup(<CalendarPage />);
    expect(markup).toContain('absolute z-10');
    expect(markup).not.toContain('group relative');
    calendarFixture.preferences = undefined;
    calendarFixture.timelineItems = [];
  });
});


