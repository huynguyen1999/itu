const BUDGET_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function currentBudgetPeriod(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: BUDGET_TIME_ZONE, year: 'numeric', month: '2-digit' }).formatToParts(date);
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}

export function shiftBudgetPeriod(period: string, offset: number): string {
  const [year, month] = period.split('-').map(Number);
  const total = year * 12 + month - 1 + offset;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

export function currentBudgetDateTimeInput(date = new Date()): string {
  const value = new Intl.DateTimeFormat('sv-SE', {
    timeZone: BUDGET_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
  return value.replace(' ', 'T');
}

export function budgetDateTimeInputToIso(value: string): string {
  return new Date(`${value}:00+07:00`).toISOString();
}
