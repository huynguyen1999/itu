import { BadRequestException, Injectable } from '@nestjs/common';
import { FocusService } from './focus.service';
import { TaskService } from './task.service';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';

@Injectable()
export class CalendarService {
  constructor(
    private readonly tasks: TaskService,
    private readonly focus: FocusService,
    private readonly prisma: PrismaService,
  ) {}

  async timeline(userId: string, from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate >= toDate) {
      throw new BadRequestException('Invalid calendar range');
    }
    const [taskPage, focusSessions, externalEvents] = await Promise.all([
      this.tasks.listTasks(userId, { from, to, limit: 100 }),
      this.focus.listFocusSessions(userId, { from, to, limit: 100 }),
      this.prisma.externalCalendarEvent.findMany({
        where: {
          userId,
          calendar: { visible: true },
          startAt: { lt: toDate },
          OR: [{ endAt: null }, { endAt: { gt: fromDate } }],
        },
        include: { calendar: { select: { name: true, color: true } } },
        take: 500,
      }),
    ]);

    const taskItems = taskPage.data.flatMap((task: any) => {
      if (task.scheduledStartAt && task.scheduledEndAt) {
        return [
          {
            id: task.id,
            kind: 'TASK_DURATION',
            title: task.title,
            startAt: task.scheduledStartAt,
            endAt: task.scheduledEndAt,
            dueAt: task.dueAt ?? null,
            allDay: false,
            taskId: task.id,
            sourceId: task.taskListId ?? null,
            sourceName: task.taskList?.title ?? null,
            color: task.taskList?.color ?? null,
            priority: task.priority,
            readOnly: false,
            status: task.status,
          },
        ];
      }
      if (task.dueAt) {
        return [
          {
            id: task.id,
            kind: 'TASK_DUE',
            title: task.title,
            startAt: task.dueAt,
            endAt: null,
            dueAt: task.dueAt,
            allDay: true,
            taskId: task.id,
            sourceId: task.taskListId ?? null,
            sourceName: task.taskList?.title ?? null,
            color: task.taskList?.color ?? null,
            priority: task.priority,
            readOnly: false,
            status: task.status,
          },
        ];
      }
      return [];
    });

    const focusItems = focusSessions
      .filter((session: any) => session.status !== 'ABANDONED')
      .map((session: any) => ({
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

    const externalItems = externalEvents.map((event) => ({
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
    }));

    return {
      from,
      to,
      items: [...taskItems, ...focusItems, ...externalItems].sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      ),
    };
  }
}
