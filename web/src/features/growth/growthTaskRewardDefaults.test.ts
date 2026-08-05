import { describe, expect, it } from 'vitest';
import { canonicalizeGrowthTaskRewardAwards } from './growthTaskRewardDefaults';

describe('growth task reward defaults', () => {
  it('drops archived/system skills before applying the three-award cap', () => {
    expect(
      canonicalizeGrowthTaskRewardAwards(
        [
          { skillId: 'general', xpReward: 100 },
          { skillId: 'archived', xpReward: 90 },
          { skillId: 'skill-c', xpReward: 30 },
          { skillId: 'skill-a', xpReward: 10 },
          { skillId: 'skill-b', xpReward: 20 },
        ],
        new Set(['skill-a', 'skill-b', 'skill-c']),
      ),
    ).toEqual([
      { skillId: 'skill-a', xpReward: 10 },
      { skillId: 'skill-b', xpReward: 20 },
      { skillId: 'skill-c', xpReward: 30 },
    ]);
  });
});
