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
