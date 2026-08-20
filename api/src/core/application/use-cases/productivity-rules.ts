import { HabitScheduleType, TaskPriority } from '@core/domain/enums';
import { HabitCalendarDefinition, isHabitScheduled as isHabitScheduledV2 } from './habit-v2';

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
  habit: Partial<HabitCalendarDefinition> & { scheduleType: HabitScheduleType; startDate: Date },
  date: Date,
) {
  return isHabitScheduledV2(
    {
      weekdays: [],
      intervalDays: null,
      restDays: [],
      endDate: null,
      timesPerPeriod: null,
      ...habit,
    } as HabitCalendarDefinition,
    date,
  );
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
