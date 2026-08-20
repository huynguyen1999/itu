import { HabitDirection, HabitScheduleType, HabitTargetType } from '@core/domain/enums';

const DAY_MS = 86_400_000;

export type HabitPeriod = 'WEEK' | 'MONTH';
export type HabitStreakUnit = 'DAY' | 'PERIOD';
export type HabitDayStatus = 'COMPLETED' | 'PARTIAL' | 'PENDING' | 'MISSED' | 'SKIPPED' | 'FAILED' | 'REST' | 'NOT_SCHEDULED';

export interface HabitCalendarDefinition {
  scheduleType: HabitScheduleType;
  weekdays: readonly number[];
  intervalDays: number | null;
  timesPerPeriod: number | null;
  period?: string | null;
  restDays: readonly number[];
  startDate: Date;
  endDate: Date | null;
  timezone?: string | null;
  direction?: HabitDirection;
  targetType?: HabitTargetType;
  targetValue?: number;
  allowedSkips?: number;
}

export interface HabitStoredState {
  occurrenceDate: Date;
  status: string;
  value?: number | null;
  progressLogs?: Array<{ value: number }>;
}

export interface HabitDayState {
  localDate: string;
  scheduled: boolean;
  status: HabitDayStatus;
  value: number;
  targetValue: number;
  progressRatio: number;
  occurrenceId?: string | null;
  periodStart?: string;
  periodEnd?: string;
}

export interface HabitInsights {
  currentStreak: number;
  bestStreak: number;
  streakUnit: HabitStreakUnit;
  last30Rate: number;
  previous30Rate: number;
  last90Rate: number;
  completed: number;
  missed: number;
  skipped: number;
  strongestWeekday: number | null;
  weakestWeekday: number | null;
  averageValue: number;
  heatmap: HabitDayState[];
}

export function localDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseLocalDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || localDateKey(date) !== value) throw new Error('Invalid local date');
  return date;
}

export function addLocalDays(value: string, amount: number): string {
  return localDateKey(new Date(parseLocalDate(value).getTime() + amount * DAY_MS));
}

export function compareLocalDates(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedStartDate(habit: HabitCalendarDefinition): string {
  return localDateKey(habit.startDate);
}

function normalizedEndDate(habit: HabitCalendarDefinition): string | null {
  return habit.endDate ? localDateKey(habit.endDate) : null;
}

export function isHabitDateInRange(habit: HabitCalendarDefinition, localDate: string | Date): boolean {
  const date = typeof localDate === 'string' ? localDate : localDateKey(localDate);
  return compareLocalDates(date, normalizedStartDate(habit)) >= 0
    && (!normalizedEndDate(habit) || compareLocalDates(date, normalizedEndDate(habit)!) <= 0);
}

export function periodOf(habit: HabitCalendarDefinition): HabitPeriod {
  return String(habit.period ?? 'WEEK').toUpperCase() === 'MONTH' ? 'MONTH' : 'WEEK';
}

export function periodBounds(localDate: string, period: HabitPeriod, weekStartDay = 1): { start: string; end: string } {
  const date = parseLocalDate(localDate);
  if (period === 'MONTH') {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    return { start: localDateKey(start), end: localDateKey(end) };
  }
  const offset = (date.getUTCDay() - weekStartDay + 7) % 7;
  return { start: addLocalDays(localDate, -offset), end: addLocalDays(localDate, 6 - offset) };
}

export function logicalLocalDate(now: Date, timezone = 'UTC', cutoffHour = 0): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = `${values.year}-${values.month}-${values.day}`;
  return Number(values.hour) < cutoffHour ? addLocalDays(date, -1) : date;
}

export function localDateTimeToUtc(localDate: string, timeLocal: string, timezone: string): Date {
  const [hours, minutes] = timeLocal.split(':').map(Number);
  const [year, month, day] = localDate.split('-').map(Number);
  const wallTime = Date.UTC(year, month - 1, day, hours, minutes);
  let candidate = wallTime;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const values = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
    const formattedWallTime = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
    );
    candidate += wallTime - formattedWallTime;
  }
  return new Date(candidate);
}

export function isHabitScheduled(habit: HabitCalendarDefinition, localDate: string | Date, weekStartDay = 1): boolean {
  const date = typeof localDate === 'string' ? localDate : localDateKey(localDate);
  if (habit.scheduleType === HabitScheduleType.TIMES_PER_PERIOD) {
    const period = periodBounds(date, periodOf(habit), weekStartDay);
    if (period.start !== date) return false;
    return compareLocalDates(period.end, normalizedStartDate(habit)) >= 0
      && (!normalizedEndDate(habit) || compareLocalDates(period.start, normalizedEndDate(habit)!) <= 0);
  }
  if (!isHabitDateInRange(habit, date)) return false;
  const start = normalizedStartDate(habit);
  const weekday = parseLocalDate(date).getUTCDay();
  if (habit.restDays.includes(weekday)) return false;
  if (habit.scheduleType === HabitScheduleType.WEEKDAYS) return habit.weekdays.includes(weekday);
  if (habit.scheduleType === HabitScheduleType.INTERVAL) {
    const days = Math.floor((parseLocalDate(date).getTime() - parseLocalDate(start).getTime()) / DAY_MS);
    return days % Math.max(1, habit.intervalDays ?? 1) === 0;
  }
  return false;
}

export function effectiveTarget(habit: HabitCalendarDefinition): number {
  return habit.scheduleType === HabitScheduleType.TIMES_PER_PERIOD
    ? Math.max(1, habit.timesPerPeriod ?? 1)
    : Math.max(0.0001, habit.targetValue ?? (habit.targetType === HabitTargetType.BOOLEAN ? 1 : 1));
}

export function progressValue(state: HabitStoredState | undefined): number {
  if (!state) return 0;
  if (state.value !== undefined && state.value !== null) return Math.max(0, state.value);
  return Math.max(0, (state.progressLogs ?? []).reduce((sum, log) => sum + log.value, 0));
}

export function statusForValue(
  habit: HabitCalendarDefinition,
  value: number,
  storedStatus?: string,
  periodClosed = false,
): HabitDayStatus {
  if (storedStatus === 'SKIPPED') return 'SKIPPED';
  if (storedStatus === 'FAILED' || (habit.direction === HabitDirection.LIMIT && value > effectiveTarget(habit))) return 'FAILED';
  const target = effectiveTarget(habit);
  if (habit.direction === HabitDirection.LIMIT) return value > target ? 'FAILED' : periodClosed ? 'COMPLETED' : 'PENDING';
  if (storedStatus === 'COMPLETED') return 'COMPLETED';
  if (value >= target) return 'COMPLETED';
  return value > 0 ? 'PARTIAL' : 'PENDING';
}

export function projectHabitDays(
  habit: HabitCalendarDefinition,
  from: string,
  to: string,
  stored: HabitStoredState[] = [],
  now = new Date(),
  weekStartDay = 1,
  cutoffHour = 0,
): HabitDayState[] {
  const byDate = new Map(stored.map((item) => [localDateKey(item.occurrenceDate), item]));
  const result: HabitDayState[] = [];
  const today = logicalLocalDate(now, habit.timezone ?? 'UTC', cutoffHour);
  const seenPeriods = new Set<string>();
  const firstDate = habit.scheduleType === HabitScheduleType.TIMES_PER_PERIOD
    ? periodBounds(from, periodOf(habit), weekStartDay).start
    : from;
  for (let date = firstDate; compareLocalDates(date, to) <= 0; date = addLocalDays(date, 1)) {
    const scheduled = isHabitScheduled(habit, date, weekStartDay);
    const period = habit.scheduleType === HabitScheduleType.TIMES_PER_PERIOD ? periodBounds(date, periodOf(habit), weekStartDay) : null;
    if (period && seenPeriods.has(period.start)) continue;
    if (period) seenPeriods.add(period.start);
    const stateDate = period?.start ?? date;
    const state = byDate.get(stateDate);
    const value = progressValue(state);
    const closed = period ? compareLocalDates(today, period.end) > 0 : compareLocalDates(today, stateDate) > 0;
    let status = scheduled
      ? statusForValue(habit, value, state?.status, closed)
      : habit.restDays.includes(parseLocalDate(date).getUTCDay()) ? 'REST' : 'NOT_SCHEDULED';
    if (scheduled && closed && (status === 'PENDING' || status === 'PARTIAL')) status = 'MISSED';
    const target = effectiveTarget(habit);
    if (compareLocalDates(stateDate, from) < 0 && habit.scheduleType !== HabitScheduleType.TIMES_PER_PERIOD) continue;
    result.push({
      localDate: stateDate,
      scheduled,
      status,
      value,
      targetValue: target,
      progressRatio: Math.min(1, value / target),
      occurrenceId: state && 'id' in state ? (state as HabitStoredState & { id?: string }).id ?? null : null,
      ...(period ? { periodStart: period.start, periodEnd: period.end } : {}),
    });
  }
  return result;
}

function contributesToStreak(status: HabitDayStatus, skipBudget: { value: number }): boolean {
  if (status === 'COMPLETED') return true;
  if (status === 'SKIPPED' && skipBudget.value > 0) {
    skipBudget.value -= 1;
    return true;
  }
  return false;
}

export function calculateStreaks(
  habit: Pick<HabitCalendarDefinition, 'scheduleType' | 'allowedSkips' | 'period'>,
  states: HabitDayState[],
): Pick<HabitInsights, 'currentStreak' | 'bestStreak' | 'streakUnit'> {
  const scheduled = states
    .filter((state) => state.scheduled && ['COMPLETED', 'SKIPPED', 'MISSED', 'FAILED'].includes(state.status))
    .sort((left, right) => left.localDate.localeCompare(right.localDate));
  const unit: HabitStreakUnit = habit.scheduleType === HabitScheduleType.TIMES_PER_PERIOD ? 'PERIOD' : 'DAY';
  const bestSkip = { value: Math.max(0, habit.allowedSkips ?? 0) };
  let best = 0;
  let running = 0;
  for (const state of scheduled) {
    if (contributesToStreak(state.status, bestSkip)) {
      running += state.status === 'COMPLETED' ? 1 : 0;
      best = Math.max(best, running);
    } else {
      running = 0;
      bestSkip.value = Math.max(0, habit.allowedSkips ?? 0);
    }
  }
  const currentSkip = { value: Math.max(0, habit.allowedSkips ?? 0) };
  let current = 0;
  for (const state of [...scheduled].reverse()) {
    if (!contributesToStreak(state.status, currentSkip)) break;
    current += state.status === 'COMPLETED' ? 1 : 0;
  }
  return { currentStreak: current, bestStreak: best, streakUnit: unit };
}

function completionRate(states: HabitDayState[]): number {
  const eligible = states.filter((state) => state.scheduled && ['COMPLETED', 'MISSED', 'FAILED'].includes(state.status));
  return eligible.length ? eligible.filter((state) => state.status === 'COMPLETED').length / eligible.length : 0;
}

export function calculateInsights(habit: HabitCalendarDefinition, states: HabitDayState[], to: string): HabitInsights {
  const sorted = states.filter((state) => state.scheduled).sort((a, b) => a.localDate.localeCompare(b.localDate));
  const end = parseLocalDate(to);
  const last30From = localDateKey(new Date(end.getTime() - 29 * DAY_MS));
  const previous30From = localDateKey(new Date(end.getTime() - 59 * DAY_MS));
  const last90From = localDateKey(new Date(end.getTime() - 89 * DAY_MS));
  const last30 = sorted.filter((state) => state.localDate >= last30From);
  const previous30 = sorted.filter((state) => state.localDate >= previous30From && state.localDate < last30From);
  const last90 = sorted.filter((state) => state.localDate >= last90From);
  const weekdayCounts = new Map<number, { completed: number; eligible: number }>();
  for (const state of last30) {
    const weekday = parseLocalDate(state.localDate).getUTCDay();
    const current = weekdayCounts.get(weekday) ?? { completed: 0, eligible: 0 };
    if (['COMPLETED', 'MISSED', 'FAILED'].includes(state.status)) current.eligible += 1;
    if (state.status === 'COMPLETED') current.completed += 1;
    weekdayCounts.set(weekday, current);
  }
  const ranked = [...weekdayCounts.entries()].filter(([, count]) => count.eligible).sort((a, b) => {
    const rateDiff = b[1].completed / b[1].eligible - a[1].completed / a[1].eligible;
    return rateDiff || a[0] - b[0];
  });
  const streaks = calculateStreaks(habit, sorted);
  return {
    ...streaks,
    last30Rate: completionRate(last30),
    previous30Rate: completionRate(previous30),
    last90Rate: completionRate(last90),
    completed: sorted.filter((state) => state.status === 'COMPLETED').length,
    missed: sorted.filter((state) => state.status === 'MISSED' || state.status === 'FAILED').length,
    skipped: sorted.filter((state) => state.status === 'SKIPPED').length,
    strongestWeekday: ranked[0]?.[0] ?? null,
    weakestWeekday: ranked.at(-1)?.[0] ?? null,
    averageValue: sorted.filter((state) => state.status === 'COMPLETED').reduce((sum, state, _, all) => sum + state.value / all.length, 0),
    heatmap: states,
  };
}
