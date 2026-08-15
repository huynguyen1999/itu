import { formatDateOnly, hcmcCurrentPeriod, hcmcDateKey, hcmcDateOnly, hcmcMonthBounds } from './calendar';

describe('HCMC calendar bounds', () => {
  it('parses date-only values at UTC+7 midnight', () => {
    expect(hcmcDateOnly('2026-08-01').toISOString()).toBe('2026-07-31T17:00:00.000Z');
  });

  it('uses HCMC month start and exclusive next-month end', () => {
    const bounds = hcmcMonthBounds('2026-08');
    expect(bounds.start.toISOString()).toBe('2026-07-31T17:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-08-31T17:00:00.000Z');
  });

  it('derives the current month in HCMC at a UTC boundary', () => {
    expect(hcmcCurrentPeriod(new Date('2026-07-31T18:00:00.000Z'))).toBe('2026-08');
  });

  it('round-trips date-only weekly values and full HCMC end day', () => {
    expect(formatDateOnly(new Date('2026-08-07T00:00:00.000Z'))).toBe('2026-08-07');
    const end = hcmcDateOnly('2026-08-07T00:00:00.000Z');
    const inclusive = new Date(end.getTime() + 24 * 60 * 60 * 1000 - 1);
    expect(inclusive.toISOString()).toBe('2026-08-07T16:59:59.999Z');
  });

  it('uses HCMC date keys at the midnight boundary', () => {
    expect(hcmcDateKey(new Date('2026-08-01T16:59:59.999Z'))).toBe('2026-08-01');
    expect(hcmcDateKey(new Date('2026-08-01T17:00:00.000Z'))).toBe('2026-08-02');
  });
});
