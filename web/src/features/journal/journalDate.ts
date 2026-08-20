/**
 * Local date utilities for Journal features ensuring date operations
 * operate on the user's local timezone instead of UTC string splitting.
 */

export function getLocalTodayDateString(): string {
  const d = new Date();
  return formatLocalDate(d);
}

export type JournalWeekStartDay = 'MONDAY' | 'SUNDAY';

export function getJournalWeekRange(
  date: Date = new Date(),
  weekStartDay: JournalWeekStartDay = 'MONDAY',
): { start: string; end: string } {
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = localDate.getDay();
  const offset = weekStartDay === 'SUNDAY' ? weekday : (weekday + 6) % 7;
  const start = new Date(localDate);
  start.setDate(start.getDate() - offset);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: formatLocalDate(start), end: formatLocalDate(end) };
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateStringToLocalDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return dateStr;
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateSlash(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return dateStr;
  return `${String(day).padStart(2, '0')} / ${String(month).padStart(2, '0')} / ${year}`;
}

export function formatDayOfWeek(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return '';
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

export function calculateDailyStreak(dates: string[], targetDate = getLocalTodayDateString()): number {
  if (!dates || dates.length === 0) return 1;
  const dateSet = new Set(dates.map((d) => d.slice(0, 10)));
  
  // Calculate consecutive days ending on targetDate or yesterday
  const checkDate = new Date(targetDate);
  let streak = 0;
  
  // If targetDate is in the set, start count from targetDate, else check if yesterday is in the set
  const targetStr = formatLocalDate(checkDate);
  const cur = new Date(checkDate);
  if (!dateSet.has(targetStr)) {
    cur.setDate(cur.getDate() - 1);
  }
  
  while (dateSet.has(formatLocalDate(cur))) {
    streak += 1;
    cur.setDate(cur.getDate() - 1);
  }
  
  return Math.max(1, streak);
}
