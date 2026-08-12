
export interface TaskScheduleShape {
  dueAt?: string | null;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
}

export interface TaskScheduleEdit {
  dueAt?: string | null;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  fieldEditedAt: Record<string, string>;
}

function oneEditedAt(): string {
  return new Date().toISOString();
}

function clockedFields(fields: string[]): Record<string, string> {
  const edited = oneEditedAt();
  return Object.fromEntries(fields.map((field) => [field, edited]));
}

function schedulePair(
  start: Date | null,
  end: Date | null,
  extra: Partial<TaskScheduleEdit> = {},
): TaskScheduleEdit {
  const edited = oneEditedAt();
  return {
    ...extra,
    scheduledStartAt: start ? start.toISOString() : null,
    scheduledEndAt: end ? end.toISOString() : null,
    fieldEditedAt: { scheduledStartAt: edited, scheduledEndAt: edited },
  };
}

function durationMs(task: TaskScheduleShape): number | null {
  if (!task.scheduledStartAt || !task.scheduledEndAt) return null;
  return new Date(task.scheduledEndAt).getTime() - new Date(task.scheduledStartAt).getTime();
}

/** Move a duration block, preserving its length. */
export function moveDurationTask(task: TaskScheduleShape, targetStart: Date): TaskScheduleEdit {
  const duration = durationMs(task);
  if (duration === null) throw new Error('Task has no duration to move');
  return schedulePair(new Date(targetStart), new Date(targetStart.getTime() + duration));
}

export function resizeTaskStart(task: TaskScheduleShape, newStart: Date): TaskScheduleEdit {
  const end = task.scheduledEndAt ? new Date(task.scheduledEndAt) : null;
  if (!end) throw new Error('Task has no duration to resize');
  const start = new Date(newStart);
  if (start.getTime() >= end.getTime()) throw new Error('Scheduled start must be before scheduled end');
  return schedulePair(start, end);
}

export function resizeTaskEnd(task: TaskScheduleShape, newEnd: Date): TaskScheduleEdit {
  const start = task.scheduledStartAt ? new Date(task.scheduledStartAt) : null;
  if (!start) throw new Error('Task has no duration to resize');
  const end = new Date(newEnd);
  if (start.getTime() >= end.getTime()) throw new Error('Scheduled end must be after scheduled start');
  return schedulePair(start, end);
}

export function clearDuration(): TaskScheduleEdit {
  return schedulePair(null, null);
}

/** Move a due-only task, preserving its existing time of day. */
export function moveDueTask(task: TaskScheduleShape, targetDate: Date): TaskScheduleEdit {
  const existing = task.dueAt ? new Date(task.dueAt) : null;
  const moved = new Date(targetDate);
  if (existing) {
    moved.setHours(existing.getHours(), existing.getMinutes(), existing.getSeconds(), existing.getMilliseconds());
  }
  return { dueAt: moved.toISOString(), fieldEditedAt: clockedFields(['dueAt']) };
}

/** Schedule an unscheduled task to the user's default due time. */
export function scheduleUnscheduledTask(task: TaskScheduleShape, targetDate: Date, defaultDueTime = '21:00'): TaskScheduleEdit {
  const [hours, minutes] = defaultDueTime.split(':').map(Number);
  const due = new Date(targetDate);
  due.setHours(Number.isFinite(hours) ? hours : 21, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return { dueAt: due.toISOString(), fieldEditedAt: clockedFields(['dueAt']) };
}
