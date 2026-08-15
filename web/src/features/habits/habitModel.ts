import type { Habit, HabitCalendarResponse, HabitDayState } from '@/shared/api/types';

export const ANYTIME_GROUP = 'Anytime';

export function localDay(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const date = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

export function shiftDay(dateStr: string, delta: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return localDay(d);
}

export function updateHabitCalendarOptimistically(
  response: HabitCalendarResponse | undefined,
  habit: Habit,
  localDate: string,
  valueDelta = 0,
  action?: 'SKIP' | 'FAIL' | 'UNDO',
): HabitCalendarResponse | undefined {
  if (!response) return response;
  let changed = false;
  const days = response.days.map((state) => {
    const matches = state.habitId === habit.id && (
      state.localDate === localDate ||
      (habit.scheduleType === 'TIMES_PER_PERIOD' && state.periodStart && state.periodEnd && localDate >= state.periodStart && localDate <= state.periodEnd)
    );
    if (!matches) return state;
    changed = true;
    const targetValue = habit.scheduleType === 'TIMES_PER_PERIOD' ? habit.timesPerPeriod ?? state.targetValue : state.targetValue;
    const value = action === 'UNDO' ? 0 : action ? state.value : Math.max(0, state.value + valueDelta);
    const status: HabitDayState['status'] = action === 'SKIP'
      ? 'SKIPPED'
      : action === 'FAIL'
        ? 'FAILED'
        : action === 'UNDO'
          ? 'PENDING'
          : habit.direction === 'LIMIT'
            ? value > targetValue ? 'FAILED' : 'PENDING'
            : value >= targetValue ? 'COMPLETED' : value > 0 ? 'PARTIAL' : 'PENDING';
    return { ...state, status, value, targetValue, progressRatio: Math.min(1, value / Math.max(targetValue, 0.0001)) };
  });
  return changed ? { ...response, days } : response;
}
