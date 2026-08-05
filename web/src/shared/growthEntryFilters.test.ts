import { describe, expect, it } from 'vitest';
import { isSelectableGrowthEntry } from './growthEntryFilters';

describe('active Growth choices', () => {
  it('excludes archived and legacy General attributes while preserving other entries', () => {
    expect(
      isSelectableGrowthEntry({
        kind: 'ATTRIBUTE',
        name: 'General',
        starterKey: 'attribute-general',
        archivedAt: null,
      }),
    ).toBe(false);
    expect(
      isSelectableGrowthEntry({
        kind: 'ATTRIBUTE',
        name: 'Intelligence',
        starterKey: 'attribute-intelligence',
        archivedAt: null,
      }),
    ).toBe(true);
    expect(
      isSelectableGrowthEntry({ kind: 'SKILL', name: 'General', starterKey: null, archivedAt: '2026-01-01T00:00:00Z' }),
    ).toBe(false);
  });
});
