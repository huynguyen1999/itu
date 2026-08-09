import { describe, expect, it } from 'vitest';
import { getCategoryColorKey, getCategoryIconKey } from './budgetCategoryIcons';

describe('budget category icons', () => {
  it('maps category names to their saved icon keys', () => {
    expect(getCategoryIconKey('Food')).toBe('food');
    expect(getCategoryIconKey('Utensils')).toBe('food');
    expect(getCategoryIconKey('Receipt')).toBe('bills');
    expect(getCategoryIconKey('Entertainment')).toBe('entertainment');
    expect(getCategoryIconKey('Transportation')).toBe('transport');
    expect(getCategoryIconKey('Weekend Travel')).toBe('weekend_travel');
  });

  it('keeps supported category colors and falls back safely', () => {
    expect(getCategoryColorKey('violet')).toBe('VIOLET');
    expect(getCategoryColorKey('unknown')).toBe('TEAL');
  });
});
