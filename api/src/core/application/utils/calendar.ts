const HCMC_OFFSET = '+07:00';
export const PRODUCT_CALENDAR_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function hcmcDateOnly(value: string): Date {
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return new Date(value);
  return new Date(`${datePart}T00:00:00.000${HCMC_OFFSET}`);
}

export function formatDateOnly(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString().slice(0, 10);
}

export function hcmcDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PRODUCT_CALENDAR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function hcmcMonthBounds(period: string): { start: Date; end: Date } {
  const [year, month] = period.split('-').map(Number);
  const start = new Date(`${period}-01T00:00:00.000${HCMC_OFFSET}`);
  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  const end = new Date(`${nextMonth}-01T00:00:00.000${HCMC_OFFSET}`);
  return { start, end };
}

export function hcmcCurrentPeriod(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(now);
}
