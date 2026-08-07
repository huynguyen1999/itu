import { describe, expect, it } from 'vitest';
import { selectGrowthRewardWeights, splitGrowthAccountXp } from './growthRewardMath';

describe('splitGrowthAccountXp', () => {
  it('splits a fixed account budget by two skill weights', () => {
    expect(
      splitGrowthAccountXp(10, [
        { skillId: 'primary', xpReward: 70 },
        { skillId: 'secondary', xpReward: 30 },
      ]),
    ).toEqual([7, 3]);
  });

  it('splits a fixed account budget by three skill weights', () => {
    expect(
      splitGrowthAccountXp(10, [
        { skillId: 'primary', xpReward: 60 },
        { skillId: 'secondary', xpReward: 25 },
        { skillId: 'tertiary', xpReward: 15 },
      ]),
    ).toEqual([6, 3, 1]);
  });

  it('caps selected skills at three without multiplying the account budget', () => {
    const result = splitGrowthAccountXp(10, [
      { skillId: 'a', xpReward: 25 },
      { skillId: 'b', xpReward: 25 },
      { skillId: 'c', xpReward: 25 },
      { skillId: 'd', xpReward: 25 },
    ]);
    expect(result).toHaveLength(3);
    expect(result.reduce((sum, amount) => sum + amount, 0)).toBe(10);
  });

  it('sorts before capping so later selected skills are deterministic', () => {
    expect(
      splitGrowthAccountXp(10, [
        { skillId: 'd', xpReward: 25 },
        { skillId: 'c', xpReward: 25 },
        { skillId: 'b', xpReward: 25 },
        { skillId: 'a', xpReward: 25 },
      ]),
    ).toEqual([4, 3, 3]);
  });

  it('excludes archived skills before sorting and capping', () => {
    const selected = selectGrowthRewardWeights(
      [
        { skillId: 'archived', xpReward: 100 },
        { skillId: 'active-c', xpReward: 30 },
        { skillId: 'active-a', xpReward: 40 },
        { skillId: 'active-b', xpReward: 30 },
      ],
      new Set(['archived']),
    );
    expect(selected.map((award) => award.skillId)).toEqual(['active-a', 'active-b', 'active-c']);
  });
});
