import { DomainException } from '@core/domain/exceptions';

export type ReminderAnchor = 'DUE_AT' | 'SCHEDULE_START_AT';

export interface TaskDateValues {
  dueAt?: Date | string | null;
  scheduledStartAt?: Date | string | null;
  scheduledEndAt?: Date | string | null;
}

export interface RelativeReminderValues {
  relativeTo?: ReminderAnchor | null;
  offsetMinutes?: number | null;
  calendarDayOffset?: number | null;
  timeOfDayMinutes?: number | null;
  timeZone?: string | null;
}

export function parseTaskDate(value: Date | string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new DomainException('Invalid task date', 'INVALID_TASK_DATE', 400);
    return value;
  }

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 21, 0, 0, 0)
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new DomainException('Invalid task date', 'INVALID_TASK_DATE', 400);
  return parsed;
}

export function validateTaskSchedule(values: TaskDateValues): void {
  const start = parseTaskDate(values.scheduledStartAt);
  const end = parseTaskDate(values.scheduledEndAt);
  if (start && end && start >= end) {
    throw new DomainException('Scheduled start must be before scheduled end', 'INVALID_TASK_SCHEDULE', 400);
  }
}

export function resolveReminderAnchor(task: TaskDateValues, relativeTo?: ReminderAnchor | null): Date | null {
  if (relativeTo === 'SCHEDULE_START_AT') return parseTaskDate(task.scheduledStartAt) ?? null;
  if (relativeTo === 'DUE_AT') return parseTaskDate(task.dueAt) ?? null;
  return parseTaskDate(task.dueAt) ?? parseTaskDate(task.scheduledStartAt) ?? null;
}

export function calculateRelativeReminderAt(task: TaskDateValues, reminder: RelativeReminderValues): Date {
  const anchor = resolveReminderAnchor(task, reminder.relativeTo);
  if (!anchor) throw new DomainException('Relative reminders require a due date or scheduled start', 'REMINDER_ANCHOR_REQUIRED', 422);

  if (reminder.offsetMinutes !== null && reminder.offsetMinutes !== undefined) {
    return new Date(anchor.getTime() + reminder.offsetMinutes * 60_000);
  }

  const dayOffset = reminder.calendarDayOffset ?? 0;
  if (reminder.timeOfDayMinutes === null || reminder.timeOfDayMinutes === undefined) {
    return new Date(anchor.getTime() + dayOffset * 86_400_000);
  }
  if (reminder.timeOfDayMinutes < 0 || reminder.timeOfDayMinutes >= 1_440) {
    throw new DomainException('Reminder time must be within a day', 'INVALID_REMINDER_TIME', 400);
  }

  const timeZone = reminder.timeZone || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(anchor);
  } catch {
    throw new DomainException('Reminder time zone is invalid', 'INVALID_REMINDER_TIME_ZONE', 400);
  }
  const parts = zonedParts(anchor, timeZone);
  const localMidnight = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset));
  return zonedDateToUtc(
    {
      year: localMidnight.getUTCFullYear(),
      month: localMidnight.getUTCMonth() + 1,
      day: localMidnight.getUTCDate(),
      hour: Math.floor(reminder.timeOfDayMinutes / 60),
      minute: reminder.timeOfDayMinutes % 60,
    },
    timeZone,
  );
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(date)
    .reduce<Record<string, number>>((result, part) => {
      if (part.type !== 'literal') result[part.type] = Number(part.value);
      return result;
    }, {});
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function zonedDateToUtc(
  local: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): Date {
  const targetUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const represented = zonedParts(new Date(targetUtc), timeZone);
  const representedUtc = Date.UTC(
    represented.year,
    represented.month - 1,
    represented.day,
    represented.hour,
    represented.minute,
    represented.second,
  );
  return new Date(targetUtc + (targetUtc - representedUtc));
}
