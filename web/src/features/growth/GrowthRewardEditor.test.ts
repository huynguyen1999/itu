import { describe, expect, it } from 'vitest';
import {
  buildGrowthRuleDraft,
  clampWeightValue,
  defaultGrowthWeights,
  growthAwardsUseSharedXp,
  growthRewardValueIsSelected,
} from '@/shared/ui/GrowthRewardEditor';

describe('Growth reward shared XP mode', () => {
  it('starts shared for equal rewards and switches to per-entry for different values', () => {
    expect(growthAwardsUseSharedXp([])).toBe(true);
    expect(growthAwardsUseSharedXp([{ xpReward: 100 }, { xpReward: 100 }])).toBe(true);
    expect(growthAwardsUseSharedXp([{ xpReward: 100 }, { xpReward: 200 }])).toBe(false);
  });
});

describe('Growth reward amount selection', () => {
  it('counts only finite positive values as selected slots', () => {
    expect(growthRewardValueIsSelected({ intelligence: '15' }, 'intelligence')).toBe(true);
    expect(growthRewardValueIsSelected({ intelligence: '0' }, 'intelligence')).toBe(false);
    expect(growthRewardValueIsSelected({ intelligence: '' }, 'intelligence')).toBe(false);
    expect(growthRewardValueIsSelected({ intelligence: 'Infinity' }, 'intelligence')).toBe(false);
    expect(growthRewardValueIsSelected({}, 'intelligence')).toBe(false);
  });
});

describe('Growth reward weight clamping', () => {
  it('caps an entered weight so the total never exceeds 100', () => {
    const current = { a: '60', b: '25', c: '15' };
    expect(clampWeightValue(current, 'b', '40')).toEqual({ a: '60', b: '25', c: '15' });
    expect(clampWeightValue(current, 'a', '80')).toEqual({ a: '60', b: '25', c: '15' });
    expect(clampWeightValue({ a: '70', b: '30' }, 'b', '40')).toEqual({ a: '70', b: '30' });
  });

  it('keeps valid inputs unchanged', () => {
    const current = { a: '60', b: '25', c: '15' };
    expect(clampWeightValue(current, 'b', '10')).toEqual({ a: '60', b: '10', c: '15' });
  });

  it('deselects on empty or non-positive input', () => {
    const current = { a: '60', b: '25', c: '15' };
    expect(clampWeightValue(current, 'b', '')).toEqual({ a: '60', b: '', c: '15' });
    expect(clampWeightValue(current, 'b', '0')).toEqual({ a: '60', c: '15' });
    expect(clampWeightValue(current, 'b', '-5')).toEqual({ a: '60', c: '15' });
  });
});

describe('Growth reward weight defaults', () => {
  it('uses the fixed primary/secondary/tertiary presets', () => {
    expect(defaultGrowthWeights(1)).toEqual([100]);
    expect(defaultGrowthWeights(2)).toEqual([70, 30]);
    expect(defaultGrowthWeights(3)).toEqual([60, 25, 15]);
  });

  it('canonicalizes unsorted persisted/draft awards before the three-skill cap', () => {
    const selectedEntries = ['skill-d', 'skill-b', 'skill-a', 'skill-c'].map((id) => ({ id }) as never);
    const draft = buildGrowthRuleDraft({
      sourceType: 'TASK',
      sourceId: 'task-1',
      coins: '0',
      accountXp: '10',
      scalingMode: 'FIXED',
      maxRewardCap: '',
      selectedEntries,
      selectedItems: [],
      xp: { 'skill-a': '25', 'skill-b': '25', 'skill-c': '25', 'skill-d': '25' },
      itemQuantities: {},
    });

    expect(draft.payload.skillAwards).toEqual([
      { skillId: 'skill-a', xpReward: 25 },
      { skillId: 'skill-b', xpReward: 25 },
      { skillId: 'skill-c', xpReward: 25 },
    ]);
  });
});
