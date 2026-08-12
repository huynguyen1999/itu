import { CalendarService } from './calendar.service';

describe('CalendarService', () => {
  it('returns all-day metadata, source colors, and task priority separately', async () => {
    const service = new CalendarService(
      { listTasks: jest.fn().mockResolvedValue({ data: [{
        id: 'task-1', title: 'Task', scheduledStartAt: '2026-08-12T09:00:00.000Z',
        scheduledEndAt: '2026-08-12T10:00:00.000Z', dueAt: null, taskListId: 'list-1',
        taskList: { title: 'Inbox', color: 'TEAL' }, priority: 'HIGH', status: 'PLANNED',
      }, {
        id: 'task-2', title: 'Due', scheduledStartAt: null, scheduledEndAt: null,
        dueAt: '2026-08-12T12:00:00.000Z', taskListId: 'list-1',
        taskList: { title: 'Inbox', color: 'TEAL' }, priority: 'LOW', status: 'PLANNED',
      }] }) } as any,
      { listFocusSessions: jest.fn().mockResolvedValue([]) } as any,
      { externalCalendarEvent: { findMany: jest.fn().mockResolvedValue([{
        id: 'event-1', title: 'Holiday', startAt: new Date('2026-08-12T00:00:00.000Z'), endAt: null,
        allDay: true, calendarId: 'calendar-1', status: 'CONFIRMED', calendar: { name: 'Work', color: 'BLUE' },
      }]) } } as any,
    );

    const result = await service.timeline('user-1', '2026-08-12T00:00:00.000Z', '2026-08-13T00:00:00.000Z');
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'task-1', allDay: false, color: 'TEAL', priority: 'HIGH' }),
      expect.objectContaining({ id: 'task-2', allDay: true, color: 'TEAL', priority: 'LOW' }),
      expect.objectContaining({ id: 'event-1', allDay: true, color: 'BLUE' }),
    ]));
  });
});
