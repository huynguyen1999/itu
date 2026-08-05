import { HabitScheduleType, TaskPriority } from '@prisma/client';

const DAY_MS = 86_400_000;

export function deriveUrgency(
  task: { urgentOverride: boolean | null; dueAt: Date | null; priority: TaskPriority },
  now: Date,
) {
  if (task.urgentOverride !== null) {
    return { urgent: task.urgentOverride, urgencyReason: task.urgentOverride ? 'Marked urgent' : 'Marked not urgent' };
  }
  if (task.dueAt && task.dueAt <= now) return { urgent: true, urgencyReason: 'Overdue' };
  if (task.dueAt && task.dueAt.getTime() - now.getTime() <= 48 * 60 * 60 * 1000) {
    return { urgent: true, urgencyReason: 'Due within 48 hours' };
  }
  if (task.priority === TaskPriority.HIGH) return { urgent: true, urgencyReason: 'High priority' };
  return { urgent: false, urgencyReason: 'No urgency trigger' };
}

export function utcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function isHabitScheduled(
  habit: {
    scheduleType: HabitScheduleType;
    weekdays: number[];
    intervalDays: number | null;
    period?: string | null;
    restDays: number[];
    startDate: Date;
    endDate: Date | null;
  },
  date: Date,
) {
  const normalized = utcDay(date);
  if (normalized < utcDay(habit.startDate) || (habit.endDate && normalized > utcDay(habit.endDate))) return false;
  if (habit.restDays.includes(normalized.getUTCDay())) return false;
  if (habit.scheduleType === HabitScheduleType.WEEKDAYS) return habit.weekdays.includes(normalized.getUTCDay());
  if (habit.scheduleType === HabitScheduleType.INTERVAL) {
    const days = Math.floor((normalized.getTime() - utcDay(habit.startDate).getTime()) / DAY_MS);
    return days % (habit.intervalDays ?? 1) === 0;
  }
  if ((habit.period ?? 'WEEK').toUpperCase() === 'MONTH') return normalized.getUTCDate() === 1;
  return normalized.getUTCDay() === 1;
}

export function focusedSeconds(session: {
  startedAt: Date;
  completedAt: Date | null;
  adjustedStartedAt: Date | null;
  adjustedCompletedAt: Date | null;
  accumulatedPauseSecs: number;
}) {
  const start = session.adjustedStartedAt ?? session.startedAt;
  const end = session.adjustedCompletedAt ?? session.completedAt ?? start;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000) - session.accumulatedPauseSecs);
}
