import { GrowthOnboardingState, GrowthSourceType } from '@prisma/client';
import { createUlid } from '@core/application/ulid';
import { ensureStarterSkills } from './ensure-starter-skills';
import { REWARD_PRESETS } from './growth-reward-presets';

type Tx = Record<string, any>;

export async function ensureHabitGrowthRule(tx: Tx, userId: string, habitId: string): Promise<void> {
  const existing = await tx.growthEarningRule.findUnique({
    where: { userId_sourceType_sourceId: { userId, sourceType: GrowthSourceType.HABIT, sourceId: habitId } },
    include: { skillAwards: { include: { skill: true } } },
  });
  if (existing?.skillAwards.some((award: any) => !award.skill.archivedAt)) return;

  let profile = await tx.growthProfile.findUnique({ where: { userId } });
  if (!profile) {
    const cycle = await tx.growthCycle.create({ data: { id: createUlid(), userId } });
    profile = await tx.growthProfile.create({
      data: {
        id: createUlid(),
        userId,
        activeCycleId: cycle.id,
        onboardingState: GrowthOnboardingState.COMPLETED,
      },
    });
  }
  await ensureStarterSkills(tx, userId, profile.activeCycleId);

  const saved = await tx.growthRewardPresetSetting.findUnique({
    where: {
      userId_preset_sourceType: {
        userId,
        preset: profile.rewardPreset,
        sourceType: GrowthSourceType.HABIT,
      },
    },
  });
  const def = saved
    ? {
        coinReward: saved.coinReward,
        accountXp: saved.accountXp,
        xpRewardPerSkill: saved.xpRewardPerSkill,
        scalingMode: saved.scalingMode,
        maxRewardCap: saved.maxRewardCap ?? undefined,
      }
    : REWARD_PRESETS[profile.rewardPreset as keyof typeof REWARD_PRESETS]?.[GrowthSourceType.HABIT];
  if (!def) return;

  if (
    existing &&
    (existing.coinReward !== def.coinReward ||
      existing.accountXp !== def.accountXp ||
      existing.scalingMode !== def.scalingMode ||
      existing.maxRewardCap !== (def.maxRewardCap ?? null))
  )
    return;

    const skills = await tx.growthSkill.findMany({
    where: { userId, archivedAt: null, starterKey: 'attribute-resilience' },
    select: { id: true },
  });

  const rule =
    existing ??
    (await tx.growthEarningRule.create({
      data: {
        id: createUlid(),
        userId,
        sourceType: GrowthSourceType.HABIT,
        sourceId: habitId,
        coinReward: def.coinReward,
        accountXp: def.accountXp,
        scalingMode: def.scalingMode,
        maxRewardCap: def.maxRewardCap ?? null,
        enabled: true,
      },
    }));

  if (def.xpRewardPerSkill > 0 && skills.length) {
    await tx.growthEarningRuleSkill.createMany({
      data: skills.map((skill: any) => ({
        ruleId: rule.id,
        skillId: skill.id,
        xpReward: def.xpRewardPerSkill,
      })),
      skipDuplicates: true,
    });
  }
}
