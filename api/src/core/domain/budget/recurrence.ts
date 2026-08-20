import type { RecurringFrequency } from './budget.domain';

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

export function advanceRecurringDate(current: Date, frequency: RecurringFrequency, anchorDate: Date): Date {
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  if (frequency === 'WEEKLY') return new Date(Date.UTC(year, month, current.getUTCDate() + 7));
  if (frequency === 'MONTHLY') {
    const nextMonth = month + 1;
    const nextYear = year + Math.floor(nextMonth / 12);
    const normalizedMonth = nextMonth % 12;
    return new Date(Date.UTC(nextYear, normalizedMonth, Math.min(anchorDate.getUTCDate(), daysInMonth(nextYear, normalizedMonth))));
  }
  const nextYear = year + 1;
  return new Date(Date.UTC(nextYear, anchorDate.getUTCMonth(), Math.min(anchorDate.getUTCDate(), daysInMonth(nextYear, anchorDate.getUTCMonth()))));
}
