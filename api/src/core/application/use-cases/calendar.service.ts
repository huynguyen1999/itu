import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { CALENDAR_REPOSITORY_PORT } from '@core/application/ports/out/calendar.port';
import type { CalendarEventRecord, CalendarRepositoryPort } from '@core/application/ports/out/calendar.port';
import { FocusService } from './focus.service';
import { TaskService } from './task.service';
import { GymService } from './gym.service';

type CalendarTask = {
  id: string;
  title: string;
  scheduledStartAt?: Date | string | null;
  scheduledEndAt?: Date | string | null;
  dueAt?: Date | string | null;
  taskListId?: string | null;
  taskList?: { isDefault?: boolean; title?: string | null; color?: string | null } | null;
  priority?: string | number | null;
  status?: string | null;
};

type FocusSession = {
  id: string;
  customTitle?: string | null;
  taskTitleSnapshot?: string | null;
  adjustedStartedAt?: Date | string | null;
  startedAt: Date | string;
  adjustedCompletedAt?: Date | string | null;
  completedAt?: Date | string | null;
  taskId?: string | null;
  status: string;
};

type TimelineItem = {
  id: string;
  startAt: Date | string;
  endAt: Date | string | null;
  [key: string]: unknown;
};

function overlapsCalendarRange(item: TimelineItem, from: Date, to: Date): boolean {
  const startAt = new Date(item.startAt);
  if (item.allDay) return startAt >= from && startAt < to;
  const endAt = item.endAt ? new Date(item.endAt) : startAt;
  return startAt < to && endAt > from;
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly tasks: TaskService,
    private readonly focus: FocusService,
    @Inject(CALENDAR_REPOSITORY_PORT) private readonly repository: CalendarRepositoryPort,
    @Optional() private readonly gymService?: GymService,
  ) {}

  async timeline(userId: string, from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate >= toDate) {
      throw new BadRequestException('Invalid calendar range');
    }

    const [taskPage, focusSessions, externalEvents, workouts] = await Promise.all([
      this.tasks.listTasks(userId, { from, to, limit: 100 }),
      this.focus.listFocusSessions(userId, { from, to, limit: 100 }),
      this.repository.listVisibleEvents(userId, fromDate, toDate),
      this.gymService ? this.gymService.getWorkouts(userId, { status: 'COMPLETED', from: fromDate, to: toDate }).catch(() => []) : Promise.resolve([]),
    ]);

    const taskItems: TimelineItem[] = (taskPage.data as CalendarTask[]).flatMap((task): TimelineItem[] => {
      const isDefaultInbox = !task.taskListId || task.taskList?.isDefault || task.taskList?.title?.toLowerCase() === 'inbox';
      const sourceId = isDefaultInbox ? null : task.taskListId ?? null;
      const sourceName = isDefaultInbox ? 'Inbox' : task.taskList?.title ?? 'Inbox';
      const common = {
        id: task.id,
        title: task.title,
        dueAt: task.dueAt ?? null,
        taskId: task.id,
        sourceId,
        sourceName,
        color: task.taskList?.color ?? null,
        priority: task.priority ?? null,
        readOnly: false,
        status: task.status ?? null,
      };

      if (task.scheduledStartAt && task.scheduledEndAt) {
        return [{ ...common, kind: 'TASK_DURATION', startAt: task.scheduledStartAt, endAt: task.scheduledEndAt, allDay: false }];
      }
      if (task.dueAt) {
        return [{ ...common, kind: 'TASK_DUE', startAt: task.dueAt, endAt: null, allDay: true }];
      }
      return [];
    });

    const focusItems: TimelineItem[] = (focusSessions as FocusSession[])
      .filter((session) => session.status !== 'ABANDONED')
      .map((session) => ({
        id: session.id,
        kind: 'FOCUS_SESSION',
        title: session.customTitle ?? session.taskTitleSnapshot ?? 'Focus session',
        startAt: session.adjustedStartedAt ?? session.startedAt,
        endAt: session.adjustedCompletedAt ?? session.completedAt ?? new Date().toISOString(),
        dueAt: null,
        allDay: false,
        taskId: session.taskId ?? null,
        sourceId: session.id,
        sourceName: 'Focus',
        color: 'VIOLET',
        priority: null,
        readOnly: true,
        status: session.status,
      }));

    const externalItems: TimelineItem[] = externalEvents.map((event: CalendarEventRecord) => ({
      id: event.id,
      kind: 'EXTERNAL_EVENT',
      title: event.title,
      startAt: event.startAt.toISOString(),
      endAt: event.endAt?.toISOString() ?? null,
      dueAt: null,
      allDay: event.allDay,
      taskId: null,
      sourceId: event.calendarId,
      sourceName: event.calendar.name,
      color: event.calendar.color,
      priority: null,
      readOnly: true,
      status: event.status,
      description: event.description ?? null,
      location: event.location ?? null,
      timeZone: event.timeZone ?? null,
    }));

    const workoutItems: TimelineItem[] = (workouts || []).map((w) => {
      const startAt = w.startedAt ? new Date(w.startedAt).toISOString() : new Date(w.createdAt).toISOString();
      const endAt = w.endedAt
        ? new Date(w.endedAt).toISOString()
        : w.durationMinutes
          ? new Date(new Date(startAt).getTime() + w.durationMinutes * 60000).toISOString()
          : startAt;
      return {
        id: w.id,
        kind: 'WORKOUT',
        title: w.title || 'Workout',
        startAt,
        endAt,
        dueAt: null,
        allDay: false,
        taskId: null,
        workoutId: w.id,
        sourceId: w.id,
        sourceName: 'Gym',
        color: 'EMERALD',
        priority: null,
        readOnly: true,
        status: 'COMPLETED',
      };
    });

    return {
      from,
      to,
      items: [...taskItems, ...focusItems, ...externalItems, ...workoutItems]
        .filter((item) => overlapsCalendarRange(item, fromDate, toDate))
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    };
  }
}
