import { advanceRecurringDate } from './recurrence';

describe('advanceRecurringDate', () => {
  const date = (value: string) => new Date(value + 'T00:00:00.000Z');

  it('keeps a monthly day anchor across short months', () => {
    const anchor = date('2024-01-31');
    expect(advanceRecurringDate(anchor, 'MONTHLY', anchor).toISOString()).toContain('2024-02-29');
    expect(advanceRecurringDate(date('2024-02-29'), 'MONTHLY', anchor).toISOString()).toContain('2024-03-31');
  });

  it('handles leap-day yearly recurrence safely', () => {
    const anchor = date('2024-02-29');
    expect(advanceRecurringDate(anchor, 'YEARLY', anchor).toISOString()).toContain('2025-02-28');
    expect(advanceRecurringDate(date('2025-02-28'), 'YEARLY', anchor).toISOString()).toContain('2026-02-28');
  });

  it('advances weekly occurrences by seven calendar days', () => {
    expect(advanceRecurringDate(date('2026-08-15'), 'WEEKLY', date('2026-08-15')).toISOString()).toContain('2026-08-22');
  });
});
