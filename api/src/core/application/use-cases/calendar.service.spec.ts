import { CalendarService } from './calendar.service';

const sourceEvent = (id: string, startAt: string, endAt: string | null = null) => ({ id, title: id, startAt: new Date(startAt), endAt: endAt ? new Date(endAt) : null, allDay: !endAt, calendarId: 'calendar-1', status: 'CONFIRMED', calendar: { name: 'Work', color: 'BLUE' } });

describe('CalendarService', () => {
  it('rejects invalid or inverted timeline ranges before reading any source', async () => {
    const listTasks = jest.fn(); const listFocusSessions = jest.fn(); const listVisibleEvents = jest.fn();
    const service = new CalendarService({ listTasks } as any, { listFocusSessions } as any, { listVisibleEvents } as any);
    await expect(service.timeline('user-1', '2026-08-13T00:00:00.000Z', '2026-08-12T00:00:00.000Z')).rejects.toThrow('Invalid calendar range');
    expect(listTasks).not.toHaveBeenCalled(); expect(listFocusSessions).not.toHaveBeenCalled(); expect(listVisibleEvents).not.toHaveBeenCalled();
  });

  it('projects duration and due tasks, excludes abandoned focus, and keeps imported work read-only', async () => {
    const service = new CalendarService(
      { listTasks: jest.fn().mockResolvedValue({ data: [
        { id: 'duration', title: 'Scheduled task', scheduledStartAt: '2026-08-12T09:00:00.000Z', scheduledEndAt: '2026-08-12T10:00:00.000Z', dueAt: '2026-08-12T12:00:00.000Z', taskListId: 'project-1', taskList: { title: 'Project', color: 'TEAL' }, priority: 'HIGH', status: 'PLANNED' },
        { id: 'due-only', title: 'Due task', scheduledStartAt: null, scheduledEndAt: null, dueAt: '2026-08-12T11:00:00.000Z', taskListId: 'project-1', taskList: { title: 'Project', color: 'TEAL' }, priority: 'LOW', status: 'PLANNED' },
        { id: 'scheduled-later', title: 'Scheduled later', scheduledStartAt: '2026-08-14T23:00:00.000Z', scheduledEndAt: '2026-08-15T03:00:00.000Z', dueAt: '2026-08-12T21:00:00.000Z', taskListId: 'project-1', taskList: { title: 'Project', color: 'TEAL' }, priority: 'LOW', status: 'PLANNED' },
      ] }) } as any,
      { listFocusSessions: jest.fn().mockResolvedValue([{ id: 'focus-completed', status: 'COMPLETED', customTitle: 'Deep work', taskTitleSnapshot: null, startedAt: '2026-08-12T08:00:00.000Z', completedAt: '2026-08-12T08:30:00.000Z', adjustedStartedAt: null, adjustedCompletedAt: null, taskId: 'duration' }, { id: 'focus-abandoned', status: 'ABANDONED', startedAt: '2026-08-12T07:00:00.000Z', completedAt: '2026-08-12T07:15:00.000Z' }]) } as any,
      { listVisibleEvents: jest.fn().mockResolvedValue([sourceEvent('external', '2026-08-12T13:00:00.000Z', '2026-08-12T14:00:00.000Z')]) } as any,
    );
    const result = await service.timeline('user-1', '2026-08-12T00:00:00.000Z', '2026-08-13T00:00:00.000Z');
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'duration', kind: 'TASK_DURATION', dueAt: '2026-08-12T12:00:00.000Z', readOnly: false }),
      expect.objectContaining({ id: 'due-only', kind: 'TASK_DUE', allDay: true, readOnly: false }),
      expect.objectContaining({ id: 'focus-completed', kind: 'FOCUS_SESSION', readOnly: true }),
      expect.objectContaining({ id: 'external', kind: 'EXTERNAL_EVENT', readOnly: true }),
    ]));
    expect(result.items.filter((item) => item.id === 'duration')).toHaveLength(1);
    expect(result.items.some((item) => item.id === 'scheduled-later')).toBe(false);
    expect(result.items.some((item) => item.id === 'focus-abandoned')).toBe(false);
  });

  it('keeps timeline items chronological and stable for ties', async () => {
    const sameStart = '2026-08-12T09:00:00.000Z';
    const service = new CalendarService(
      { listTasks: jest.fn().mockResolvedValue({ data: [{ id: 'task', title: 'Task', scheduledStartAt: sameStart, scheduledEndAt: '2026-08-12T10:00:00.000Z', dueAt: null, taskListId: null, taskList: null, priority: 'MEDIUM', status: 'PLANNED' }] }) } as any,
      { listFocusSessions: jest.fn().mockResolvedValue([{ id: 'focus', status: 'COMPLETED', customTitle: 'Focus', taskTitleSnapshot: null, startedAt: sameStart, completedAt: '2026-08-12T09:30:00.000Z', adjustedStartedAt: null, adjustedCompletedAt: null, taskId: null }]) } as any,
      { listVisibleEvents: jest.fn().mockResolvedValue([sourceEvent('external', sameStart)]) } as any,
    );
    const result = await service.timeline('user-1', '2026-08-12T00:00:00.000Z', '2026-08-13T00:00:00.000Z');
    expect(result.items.map((item) => item.id)).toEqual(['task', 'focus', 'external']);
  });

  it('keeps Inbox grouping and nullable metadata response fields', async () => {
    const service = new CalendarService(
      { listTasks: jest.fn().mockResolvedValue({ data: [{ id: 'inbox-task', title: 'Inbox task', dueAt: '2026-08-12T09:00:00.000Z', taskListId: 'default-project', taskList: { isDefault: true, title: 'My Tasks', color: 'TEAL' }, priority: 'NONE', status: 'PLANNED' }] }) } as any,
      { listFocusSessions: jest.fn().mockResolvedValue([{ id: 'focus', status: 'COMPLETED', startedAt: '2026-08-12T10:00:00.000Z', completedAt: '2026-08-12T10:30:00.000Z' }]) } as any,
      { listVisibleEvents: jest.fn().mockResolvedValue([sourceEvent('external', '2026-08-12T11:00:00.000Z')]) } as any,
    );

    const result = await service.timeline('user-1', '2026-08-12T00:00:00.000Z', '2026-08-13T00:00:00.000Z');
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'inbox-task', sourceId: null, sourceName: 'Inbox' }),
      expect.objectContaining({ id: 'focus', priority: null }),
      expect.objectContaining({ id: 'external', priority: null }),
    ]));
  });

  it('includes multi-day all-day events that started before the range but extend into it', async () => {
    const multiDayEvent = {
      id: 'multi-day-holiday',
      title: 'Vacation',
      startAt: new Date('2026-08-10T00:00:00.000Z'),
      endAt: new Date('2026-08-15T00:00:00.000Z'),
      allDay: true,
      calendarId: 'calendar-1',
      status: 'CONFIRMED',
      calendar: { name: 'Personal', color: 'EMERALD' },
    };
    const service = new CalendarService(
      { listTasks: jest.fn().mockResolvedValue({ data: [] }) } as any,
      { listFocusSessions: jest.fn().mockResolvedValue([]) } as any,
      { listVisibleEvents: jest.fn().mockResolvedValue([multiDayEvent]) } as any,
    );

    const result = await service.timeline('user-1', '2026-08-12T00:00:00.000Z', '2026-08-13T00:00:00.000Z');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: 'multi-day-holiday', kind: 'EXTERNAL_EVENT', allDay: true });
  });
});
