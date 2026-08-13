import type { DragEvent, MutableRefObject, PointerEvent } from 'react';
import type { CalendarTimelineItem, ProductivityTask } from '@/shared/api/client';
import { getStoredTaskPreferences } from '@/shared/api/preferencesApi';
import { moveDueTask, moveDurationTask, resizeTaskEnd, resizeTaskStart, scheduleUnscheduledTask, type TaskScheduleEdit, type TaskScheduleShape } from '@/shared/tasks/taskSchedule';
import { CALENDAR_DAY_WIDTH, CALENDAR_GUTTER_WIDTH, snapTimestamp, type TimelineZoom } from '../timeline';
import { calendarTimelineKey, type ResizePreviewState } from './useCalendarData';

type CalendarTaskMutation = { id: string; patch: Record<string, unknown> };
type QueryClientLike = { setQueryData: (queryKey: readonly unknown[], updater: (current: CalendarTimelineData | undefined) => CalendarTimelineData | undefined) => void };
type CalendarTimelineData = { from: string; to: string; items: CalendarTimelineItem[] };

function asTaskPatch(schedule: TaskScheduleEdit): Record<string, unknown> {
  return schedule as unknown as Record<string, unknown>;
}

export type UseCalendarTaskInteractionsArgs = {
  zoom: TimelineZoom;
  range: { from: Date; to: Date };
  from: string;
  to: string;
  trackRef: MutableRefObject<HTMLDivElement | null>;
  queryClient: QueryClientLike;
  updateTask: (mutation: CalendarTaskMutation) => void;
  taskById: Map<string, ProductivityTask>;
  showCompleted: boolean;
  setResizePreview: (value: ResizePreviewState | null) => void;
};

const DAY_HOUR_HEIGHT = 60;
const MONTH_DATE_WIDTH = 112;

export function useCalendarTaskInteractions({ zoom, range, from, to, trackRef, queryClient, updateTask, taskById, showCompleted, setResizePreview }: UseCalendarTaskInteractionsArgs) {
  function updateOptimistic(id: string, patch: Record<string, unknown>) {
    const task = taskById.get(id);
    if (!task) return;
    const next = { ...task, ...patch } as ProductivityTask;
    queryClient.setQueryData(calendarTimelineKey(from, to), (current) => current && ({
      ...current,
      items: current.items.flatMap((item) => item.taskId === id ? (projectTask(next, item) ? [projectTask(next, item)!] : []) : [item]),
    }));
  }

  function projectTask(task: ProductivityTask, previous: CalendarTimelineItem): CalendarTimelineItem | null {
    if (task.status === 'COMPLETED' && !showCompleted) return null;
    if (task.scheduledStartAt && task.scheduledEndAt) return { ...previous, kind: 'TASK_DURATION', startAt: task.scheduledStartAt, endAt: task.scheduledEndAt, allDay: false, dueAt: task.dueAt };
    if (task.dueAt) return { ...previous, kind: 'TASK_DUE', startAt: task.dueAt, endAt: null, allDay: true, dueAt: task.dueAt };
    return null;
  }

  function dropTask(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/iTu-calendar-task');
    if (!raw || !trackRef.current) return;
    const payload = JSON.parse(raw) as { id: string; durationMs?: number };
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-calendar-day]');
    const date = target?.dataset.calendarDay ? new Date(target.dataset.calendarDay) : new Date(range.from);
    if (zoom === 'DAY') {
      const rect = (target ?? trackRef.current).getBoundingClientRect();
      const totalMins = Math.max(0, Math.min(1439, Math.floor(((event.clientY - rect.top) / (24 * DAY_HOUR_HEIGHT)) * 1440)));
      date.setHours(Math.floor(totalMins / 60), totalMins % 60, 0, 0);
    } else date.setHours(9, 0, 0, 0);
    const start = snapTimestamp(date, zoom === 'DAY' ? 'DAY' : 'WEEK');
    const task = taskById.get(payload.id);
    const shape: TaskScheduleShape = task ?? { dueAt: null };
    const schedule: Record<string, unknown> = task?.scheduledStartAt && task.scheduledEndAt
      ? asTaskPatch(moveDurationTask(shape, start))
      : task?.dueAt ? asTaskPatch(moveDueTask(shape, start)) : asTaskPatch(scheduleUnscheduledTask(shape, start, getStoredTaskPreferences().defaultDueTime));
    const patch: Record<string, unknown> = payload.durationMs
      ? { scheduledStartAt: start.toISOString(), scheduledEndAt: new Date(start.getTime() + payload.durationMs).toISOString() }
      : schedule;
    updateOptimistic(payload.id, patch);
    updateTask({ id: payload.id, patch });
  }

  function dragItem(item: CalendarTimelineItem, event: DragEvent<HTMLElement>) {
    if (!item.taskId) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/iTu-calendar-task', JSON.stringify({ id: item.taskId, durationMs: item.endAt ? new Date(item.endAt).getTime() - new Date(item.startAt).getTime() : undefined }));
  }

  function resizeTask(item: CalendarTimelineItem, edge: 'start' | 'end', event: PointerEvent) {
    if (item.readOnly || item.kind !== 'TASK_DURATION' || !item.taskId || !item.endAt || !trackRef.current) return;
    event.preventDefault(); event.stopPropagation();
    const originStart = new Date(item.startAt).getTime();
    const originEnd = new Date(item.endAt).getTime();
    const toTimestamp = (clientX: number, clientY: number) => {
      if (zoom === 'DAY') {
        const rect = (trackRef.current?.querySelector<HTMLElement>('[data-calendar-day]') ?? trackRef.current!).getBoundingClientRect();
        const mins = Math.max(0, Math.min(1439, Math.round(((clientY - rect.top) / (24 * DAY_HOUR_HEIGHT)) * 1440)));
        const date = new Date(range.from); date.setHours(Math.floor(mins / 60), mins % 60, 0, 0); return snapTimestamp(date, 'DAY');
      }
      const rect = trackRef.current!.getBoundingClientRect();
      const width = zoom === 'MONTH' ? MONTH_DATE_WIDTH : trackRef.current!.querySelector<HTMLElement>('[data-calendar-day]')?.getBoundingClientRect().width ?? CALENDAR_DAY_WIDTH;
      const date = new Date(range.from); date.setDate(date.getDate() + Math.floor(Math.max(0, clientX - rect.left + trackRef.current!.scrollLeft - CALENDAR_GUTTER_WIDTH) / width)); date.setHours(9, 0, 0, 0); return snapTimestamp(date, 'WEEK');
    };
    let latestStartAt = item.startAt;
    let latestEndAt = item.endAt;
    const onMove = (move: globalThis.PointerEvent) => {
      const next = toTimestamp(move.clientX, move.clientY).getTime();
      const start = edge === 'start' ? next : originStart; const end = edge === 'end' ? next : originEnd;
      if (end <= start) return;
      latestStartAt = new Date(start).toISOString(); latestEndAt = new Date(end).toISOString();
      setResizePreview({ itemId: item.id, taskId: item.taskId!, edge, startAt: latestStartAt, endAt: latestEndAt });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); setResizePreview(null);
      const shape = { scheduledStartAt: item.startAt, scheduledEndAt: item.endAt };
      const schedule = edge === 'start' ? resizeTaskStart(shape, new Date(latestStartAt)) : resizeTaskEnd(shape, new Date(latestEndAt));
      const patch = asTaskPatch(schedule);
      updateOptimistic(item.taskId!, patch); updateTask({ id: item.taskId!, patch });
    };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true });
  }

  function resizeTaskStep(item: CalendarTimelineItem, edge: 'start' | 'end', direction: -1 | 1) {
    if (item.readOnly || item.kind !== 'TASK_DURATION' || !item.taskId || !item.endAt) return;
    const step = (zoom === 'DAY' ? 15 : 24 * 60) * 60_000;
    const start = new Date(item.startAt).getTime() + (edge === 'start' ? direction * step : 0);
    const end = new Date(item.endAt).getTime() + (edge === 'end' ? direction * step : 0);
    if (end <= start) return;
    const shape = { scheduledStartAt: item.startAt, scheduledEndAt: item.endAt };
    const schedule = edge === 'start' ? resizeTaskStart(shape, new Date(start)) : resizeTaskEnd(shape, new Date(end));
    const patch = asTaskPatch(schedule);
    updateOptimistic(item.taskId, patch); updateTask({ id: item.taskId, patch });
  }

  return { dropTask, dragItem, resizeTask, resizeTaskStep };
}
