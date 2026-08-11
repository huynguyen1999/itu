import { describe, expect, it } from 'vitest';
import { formatWeight, fromDisplayWeight, toDisplayWeight } from './weightUnits';

describe('Gym weight units', () => {
  it('converts canonical kilograms to pounds and back', () => {
    expect(toDisplayWeight(100, 'LBS')).toBeCloseTo(220.4623, 3);
    expect(fromDisplayWeight(220.4623, 'LBS')).toBeCloseTo(100, 3);
  });

  it('formats converted values with the selected unit', () => {
    expect(formatWeight(20, 'KG')).toBe('20 kg');
    expect(formatWeight(20, 'LBS')).toBe('44.09 lb');
  });
});
