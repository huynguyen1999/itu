import { describe, expect, it } from 'vitest';
import { budgetDateTimeInputToIso, currentBudgetPeriod, shiftBudgetPeriod } from './budgetPeriod';

describe('budget period rules', () => {
  it('uses UTC+7 for month boundaries', () => {
    expect(currentBudgetPeriod(new Date('2026-07-31T17:30:00.000Z'))).toBe('2026-08');
  });

  it('shifts periods without local timezone drift', () => {
    expect(shiftBudgetPeriod('2026-01', -1)).toBe('2025-12');
    expect(shiftBudgetPeriod('2025-12', 1)).toBe('2026-01');
  });

  it('parses transaction inputs as UTC+7', () => {
    expect(budgetDateTimeInputToIso('2026-08-10T09:30')).toBe('2026-08-10T02:30:00.000Z');
  });
});
