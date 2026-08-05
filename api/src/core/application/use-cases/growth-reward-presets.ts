import { GrowthRewardPreset, GrowthSourceType, GrowthScalingMode } from '@prisma/client';

export interface PresetRuleDefinition {
  coinReward: number;
  accountXp: number;
  xpRewardPerSkill: number;
  scalingMode: GrowthScalingMode;
  maxRewardCap?: number;
}

export const REWARD_PRESETS: Record<GrowthRewardPreset, Record<GrowthSourceType, PresetRuleDefinition>> = {
  [GrowthRewardPreset.LIGHT]: {
    [GrowthSourceType.TASK]: { coinReward: 1, accountXp: 5, xpRewardPerSkill: 5, scalingMode: GrowthScalingMode.FIXED },
    [GrowthSourceType.HABIT]: { coinReward: 1, accountXp: 3, xpRewardPerSkill: 3, scalingMode: GrowthScalingMode.FIXED },
    [GrowthSourceType.FOCUS_PRESET]: { coinReward: 2, accountXp: 5, xpRewardPerSkill: 5, scalingMode: GrowthScalingMode.FIXED },
    [GrowthSourceType.REVIEW_DECK]: {
      coinReward: 1,
      accountXp: 1,
      xpRewardPerSkill: 1,
      scalingMode: GrowthScalingMode.LINEAR,
      maxRewardCap: 30,
    },
  },
  [GrowthRewardPreset.STANDARD]: {
    [GrowthSourceType.TASK]: { coinReward: 3, accountXp: 15, xpRewardPerSkill: 15, scalingMode: GrowthScalingMode.FIXED },
    [GrowthSourceType.HABIT]: { coinReward: 2, accountXp: 10, xpRewardPerSkill: 10, scalingMode: GrowthScalingMode.FIXED },
    [GrowthSourceType.FOCUS_PRESET]: { coinReward: 5, accountXp: 15, xpRewardPerSkill: 15, scalingMode: GrowthScalingMode.FIXED },
    [GrowthSourceType.REVIEW_DECK]: {
      coinReward: 2,
      accountXp: 3,
      xpRewardPerSkill: 3,
      scalingMode: GrowthScalingMode.LINEAR,
      maxRewardCap: 75,
    },
  },
  [GrowthRewardPreset.STRONG]: {
    [GrowthSourceType.TASK]: { coinReward: 5, accountXp: 30, xpRewardPerSkill: 30, scalingMode: GrowthScalingMode.FIXED },
    [GrowthSourceType.HABIT]: { coinReward: 4, accountXp: 20, xpRewardPerSkill: 20, scalingMode: GrowthScalingMode.FIXED },
    [GrowthSourceType.FOCUS_PRESET]: { coinReward: 8, accountXp: 30, xpRewardPerSkill: 30, scalingMode: GrowthScalingMode.FIXED },
    [GrowthSourceType.REVIEW_DECK]: {
      coinReward: 4,
      accountXp: 5,
      xpRewardPerSkill: 5,
      scalingMode: GrowthScalingMode.LINEAR,
      maxRewardCap: 150,
    },
  },
};
