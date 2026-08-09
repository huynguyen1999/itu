import { describe, expect, it } from 'vitest';
import { validateUsageRange } from './SettingsPage';

describe('usage deletion range validation', () => {
  it('requires both dates and caps the inclusive range at 365 days', () => {
    expect(validateUsageRange({ from: '', to: '2026-01-01' })).toBe('Choose both dates.');
    expect(validateUsageRange({ from: '2026-01-02', to: '2026-01-01' })).toContain('before');
    expect(validateUsageRange({ from: '2025-01-01', to: '2025-12-31' })).toBe('');
    expect(validateUsageRange({ from: '2025-01-01', to: '2026-01-01' })).toContain('365 days');
  });
});
