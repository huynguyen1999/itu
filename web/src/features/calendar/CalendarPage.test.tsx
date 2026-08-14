import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { applyTaskDefaults } from '@/shared/taskDefaults';

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
import { formatSingleDate, formatSingleTime } from './timeline';

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

  it('uses one authoritative source color for grouped tasks, Focus, and external calendars', () => {
    const groups = groupCalendarItems([
      { id: 'project-duration', kind: 'TASK_DURATION', title: 'Scheduled', startAt: '2026-08-12T09:00:00Z', endAt: '2026-08-12T10:00:00Z', sourceId: 'project-a', sourceName: 'Project A', color: 'ROSE', readOnly: false },
      { id: 'project-due', kind: 'TASK_DUE', title: 'Due', startAt: '2026-08-12T11:00:00Z', endAt: null, sourceId: 'project-a', sourceName: 'Project A', readOnly: false },
      { id: 'calendar-event', kind: 'EXTERNAL_EVENT', title: 'Imported', startAt: '2026-08-12T12:00:00Z', endAt: '2026-08-12T13:00:00Z', sourceId: 'calendar-a', sourceName: 'TalkFirst', color: 'CORAL', readOnly: true },
      { id: 'focus-session', kind: 'FOCUS_SESSION', title: 'Focus', startAt: '2026-08-12T14:00:00Z', endAt: '2026-08-12T15:00:00Z', sourceId: 'focus-a', sourceName: 'Focus', readOnly: true },
    ]);

    const project = groups.find((group) => group.id === 'project:project-a');
    expect(project?.color).toBe('#e11d48');
    expect(project?.items.every((item) => item.color === project.color)).toBe(true);
    expect(groups.find((group) => group.id === 'calendar:calendar-a')?.color).toBe('var(--itu-coral-500)');
    expect(groups.find((group) => group.id === 'focus')?.color).toBe('#8b6fc9');
  });

  it('uses the stored default due time when assigning a default task date', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ tasks: { defaultDueTime: '18:45' } }),
      setItem: vi.fn(),
    });

    try {
      const dueAt = applyTaskDefaults({ title: 'Arrange this task' }, {
        date: 'TODAY',
        priority: 'NONE',
        taskListId: '',
      }).dueAt;

      expect(dueAt).toBeDefined();
      const due = new Date(dueAt!);
      expect(due.getHours()).toBe(18);
      expect(due.getMinutes()).toBe(45);
      expect(due.getSeconds()).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
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
    expect(markup).toContain('ALL-DAY');
    expect(markup).toContain('TIME');
    expect(markup).toContain('All-day task 1');
    expect(markup).toContain('All-day task 2');
    calendarFixture.preferences = undefined;
    calendarFixture.timelineItems = [];
  });

  it('keeps the hourly viewport bounded and pins the week all-day band', () => {
    calendarFixture.preferences = {
      calendar: { zoom: 'WEEK', visibleKinds: ['TASK_DURATION', 'TASK_DUE'], showCompleted: true, collapsedGroupIds: [] },
    };
    calendarFixture.timelineItems = [{
      id: 'week-all-day',
      kind: 'TASK_DUE',
      title: 'All-day week task',
      startAt: '2026-08-12T00:00:00.000Z',
      endAt: null,
      allDay: true,
      readOnly: false,
      taskId: 'week-all-day',
    }];

    const markup = renderToStaticMarkup(<CalendarPage />);

    expect(markup).toContain('h-[calc(100vh-220px)]');
    expect(markup).toContain('sticky top-12 z-40');
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

  it('splits overlapping timed tasks into side-by-side week lanes', () => {
    calendarFixture.preferences = {
      calendar: { zoom: 'WEEK', visibleKinds: ['TASK_DURATION'], showCompleted: true, collapsedGroupIds: [] },
    };
    calendarFixture.timelineItems = [1, 2, 3].map((index) => ({
      id: `week-overlap-${index}`,
      kind: 'TASK_DURATION',
      title: `Week overlap ${index}`,
      startAt: '2026-08-12T18:00:00.000Z',
      endAt: '2026-08-12T19:00:00.000Z',
      allDay: false,
      readOnly: false,
      taskId: `week-overlap-${index}`,
    }));

    const markup = renderToStaticMarkup(<CalendarPage />);
    const laneWidths = markup.match(/width:calc\(4\.7619/g) ?? [];
    expect(laneWidths.length).toBe(3);
    expect(markup).toContain('left:calc(57.14285714285714% + 2px)');
    expect(markup).toContain('left:calc(61.9047619047619% + 2px)');
    expect(markup).toContain('left:calc(66.66666666666667% + 2px)');

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

  it('shows local dates beside both endpoints of a multi-day duration task', () => {
    calendarFixture.preferences = {
      calendar: { zoom: 'DAY', visibleKinds: ['TASK_DURATION'], showCompleted: true, collapsedGroupIds: [] },
    };
    calendarFixture.timelineItems = [{
      id: 'overnight-task',
      kind: 'TASK_DURATION',
      title: 'Overnight task',
      startAt: '2026-08-12T23:00:00.000',
      endAt: '2026-08-13T03:00:00.000',
      allDay: false,
      readOnly: false,
      taskId: 'overnight-task',
    }];

    const markup = renderToStaticMarkup(<CalendarPage />);

    expect(markup).toContain(`${formatSingleTime('2026-08-12T23:00:00.000')} · ${formatSingleDate('2026-08-12T23:00:00.000')}`);
    expect(markup).toContain(`${formatSingleTime('2026-08-13T03:00:00.000')} · ${formatSingleDate('2026-08-13T03:00:00.000')}`);

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

  it('persists the visible range filters for completed and read-only items', () => {
    calendarFixture.preferences = {
      calendar: { zoom: 'WEEK', visibleKinds: ['TASK_DURATION', 'FOCUS_SESSION'], showCompleted: false, collapsedGroupIds: [] },
    };
    calendarFixture.timelineItems = [
      {
        id: 'active-task',
        kind: 'TASK_DURATION',
        title: 'Active task',
        startAt: '2026-08-12T09:00:00.000Z',
        endAt: '2026-08-12T10:00:00.000Z',
        allDay: false,
        readOnly: false,
        taskId: 'active-task',
      },
      {
        id: 'completed-task',
        kind: 'TASK_DURATION',
        title: 'Completed task',
        startAt: '2026-08-12T11:00:00.000Z',
        endAt: '2026-08-12T12:00:00.000Z',
        allDay: false,
        readOnly: false,
        status: 'COMPLETED',
        taskId: 'completed-task',
      },
      {
        id: 'focus-session',
        kind: 'FOCUS_SESSION',
        title: 'Quiet focus',
        startAt: '2026-08-12T13:00:00.000Z',
        endAt: '2026-08-12T14:00:00.000Z',
        allDay: false,
        readOnly: true,
      },
      {
        id: 'external-event',
        kind: 'EXTERNAL_EVENT',
        title: 'Subscription event',
        startAt: '2026-08-12T15:00:00.000Z',
        endAt: '2026-08-12T16:00:00.000Z',
        allDay: false,
        readOnly: true,
      },
    ];

    const markup = renderToStaticMarkup(<CalendarPage />);

    expect(markup).toContain('Active task, Task, draggable');
    expect(markup).toContain('Quiet focus, Focus Session, read-only');
    expect(markup).not.toContain('Completed task');
    expect(markup).not.toContain('Subscription event');
  });

  it('collapses a persisted source group without rendering its items', () => {
    calendarFixture.preferences = {
      calendar: { zoom: 'DAY', visibleKinds: ['TASK_DURATION'], showCompleted: true, collapsedGroupIds: ['project:inbox'] },
    };
    calendarFixture.timelineItems = [{
      id: 'collapsed-task',
      kind: 'TASK_DURATION',
      title: 'Collapsed task',
      startAt: '2026-08-12T09:00:00.000Z',
      endAt: '2026-08-12T10:00:00.000Z',
      allDay: false,
      readOnly: false,
      taskId: 'collapsed-task',
    }];

    const markup = renderToStaticMarkup(<CalendarPage />);

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('Inbox · 1');
    expect(markup).not.toContain('Collapsed task');
  });

  it('keeps task drag and resize controls keyboard-focusable while read-only items stay locked', () => {
    calendarFixture.preferences = {
      calendar: { zoom: 'DAY', visibleKinds: ['TASK_DURATION', 'FOCUS_SESSION', 'EXTERNAL_EVENT'], showCompleted: true, collapsedGroupIds: [] },
    };
    calendarFixture.timelineItems = [
      {
        id: 'scheduled-task',
        kind: 'TASK_DURATION',
        title: 'Scheduled task',
        startAt: '2026-08-12T09:00:00.000Z',
        endAt: '2026-08-12T10:00:00.000Z',
        allDay: false,
        readOnly: false,
        taskId: 'scheduled-task',
      },
      {
        id: 'focus-session',
        kind: 'FOCUS_SESSION',
        title: 'Focus session',
        startAt: '2026-08-12T11:00:00.000Z',
        endAt: '2026-08-12T12:00:00.000Z',
        allDay: false,
        readOnly: true,
      },
      {
        id: 'external-event',
        kind: 'EXTERNAL_EVENT',
        title: 'External event',
        startAt: '2026-08-12T13:00:00.000Z',
        endAt: '2026-08-12T14:00:00.000Z',
        allDay: false,
        readOnly: true,
      },
    ];

    const markup = renderToStaticMarkup(<CalendarPage />);

    expect(markup).toContain('Scheduled task, Task, draggable');
    expect(markup).toContain('aria-label="Resize start of Scheduled task"');
    expect(markup).toContain('aria-label="Resize end of Scheduled task"');
    expect(markup).toContain('Focus session, Focus Session, read-only');
    expect(markup).toContain('External event, Subscription, read-only');
    expect(markup).not.toContain('Resize start of Focus session');
    expect(markup).not.toContain('Resize end of External event');
  });
});
