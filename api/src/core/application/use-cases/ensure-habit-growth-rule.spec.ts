import { GrowthRewardPreset, GrowthScalingMode, Prisma } from '@prisma/client';
jest.mock('./ensure-starter-skills', () => ({ ensureStarterSkills: jest.fn() }));
import { ensureHabitGrowthRule } from './ensure-habit-growth-rule';

describe('ensureHabitGrowthRule', () => {
  it('repairs a default habit rule that has no active growth award', async () => {
    const createMany = jest.fn();
    const tx = {
      growthEarningRule: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rule-1',
          coinReward: 2,
          accountXp: 10,
          scalingMode: GrowthScalingMode.FIXED,
          maxRewardCap: null,
          skillAwards: [],
        }),
      },
      growthProfile: {
        findUnique: jest.fn().mockResolvedValue({
          activeCycleId: 'cycle-1',
          rewardPreset: GrowthRewardPreset.STANDARD,
        }),
      },
      growthSkill: {
        findMany: jest.fn().mockResolvedValue([{ id: 'resilience-1' }]),
      },
      growthAttributeMapping: { findMany: jest.fn().mockResolvedValue([]) },
      growthRewardPresetSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      growthEarningRuleSkill: { createMany },
    } as unknown as Prisma.TransactionClient;

    await ensureHabitGrowthRule(tx, 'user-1', 'habit-1');

    expect(createMany).toHaveBeenCalledWith({
      data: [{ ruleId: 'rule-1', skillId: 'resilience-1', xpReward: 10 }],
      skipDuplicates: true,
    });
    expect((tx.growthSkill.findMany as jest.Mock).mock.calls.at(-1)?.[0]).toEqual({
      where: { userId: 'user-1', archivedAt: null, starterKey: 'attribute-resilience' },
      select: { id: true },
    });
  });
});
