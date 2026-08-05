import { describe, expect, it } from 'vitest';
import { validateGrowthAttributeMappings } from './growthAttributeMappings';

describe('Skill → Attribute mapping validation', () => {
  it('accepts a primary-only 100% route', () => {
    expect(validateGrowthAttributeMappings([{ attributeId: 'intelligence', slot: 'PRIMARY', weight: 100 }])).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('accepts a 70/30 primary and secondary route', () => {
    expect(
      validateGrowthAttributeMappings([
        { attributeId: 'intelligence', slot: 'PRIMARY', weight: 70 },
        { attributeId: 'creativity', slot: 'SECONDARY', weight: 30 },
      ]).valid,
    ).toBe(true);
  });

  it('rejects duplicate attributes, invalid weights, and non-100 totals', () => {
    const result = validateGrowthAttributeMappings([
      { attributeId: 'intelligence', slot: 'PRIMARY', weight: 60 },
      { attributeId: 'intelligence', slot: 'SECONDARY', weight: 20 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Primary weight|different|100%/);
  });
});
