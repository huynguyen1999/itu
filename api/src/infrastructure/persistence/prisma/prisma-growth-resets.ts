import {
  GrowthCurrency,
  GrowthLedgerKind,
  GrowthResetScope,
  GrowthRewardPreset,
  GrowthScalingMode,
  GrowthSourceType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from './prisma.service';
import { createUlid } from './ulid';
import { growthLevelProgress } from '@core/application/use-cases/growth-rules';
import { REWARD_PRESETS } from '@core/application/use-cases/growth-reward-presets';

type GrowthRuleDefinition = {
  coinReward: number;
  accountXp: number;
  xpRewardPerSkill: number;
  scalingMode: GrowthScalingMode;
  maxRewardCap?: number;
};

type UpsertRule = (
  tx: Prisma.TransactionClient,
  userId: string,
  sourceType: GrowthSourceType,
  sourceId: string,
  definition: GrowthRuleDefinition,
  skills: Array<{ id: string; starterKey?: string | null }>,
) => Promise<void>;

export class PrismaGrowthResets {
  constructor(
    private readonly db: PrismaService,
    private readonly getProfile: (userId: string) => Promise<any>,
    private readonly upsertRule: UpsertRule,
  ) {}

  async previewReset(userId: string, scope: GrowthResetScope, skillId?: string) {
    const profile = await this.getProfile(userId);
    const activeCycleId = profile.activeCycleId;

    if (scope === GrowthResetScope.SKILL) {
      if (!skillId) throw new Error('skillId is required for SKILL reset scope');
      const skill = await this.db.growthSkill.findFirst({ where: { id: skillId, userId } });
      if (!skill) throw new Error('Skill not found');
      const agg = await this.db.growthLedgerEntry.aggregate({
        where: { userId, skillId, cycleId: activeCycleId, currency: GrowthCurrency.SKILL_XP },
        _sum: { amount: true },
      });
      const currentXp = Math.max(0, agg._sum.amount ?? 0);
      const currentLevel = growthLevelProgress(currentXp, skill.baseXp).level;
      return {
        scope,
        affectedSkills: [{ id: skill.id, name: skill.name, xpToReset: currentXp, currentLevel, newLevel: 1 }],
      };
    }

    const skills = await this.db.growthSkill.findMany({
      where: { userId, archivedAt: null },
      include: {
        ledgerEntries: {
          where: { cycleId: activeCycleId, currency: GrowthCurrency.SKILL_XP },
          select: { amount: true },
        },
      },
    });

    const affectedSkills = skills.map((skill: any) => {
      const currentXp = Math.max(0, skill.ledgerEntries.reduce((sum: number, entry: any) => sum + entry.amount, 0));
      const currentLevel = growthLevelProgress(currentXp, skill.baseXp).level;
      return { id: skill.id, name: skill.name, xpToReset: currentXp, currentLevel, newLevel: 1 };
    });

    if (scope === GrowthResetScope.ALL_XP) return { scope, affectedSkills };

    const coinAgg = await this.db.growthLedgerEntry.aggregate({
      where: { userId, currency: GrowthCurrency.COIN },
      _sum: { amount: true },
    });
    return {
      scope,
      affectedSkills,
      coinBalanceToReset: Math.max(0, coinAgg._sum.amount ?? 0),
    };
  }

  async executeReset(
    userId: string,
    data: {
      scope: GrowthResetScope;
      skillId?: string;
      idempotencyKey: string;
      keepEarningRules?: boolean;
      keepShopRewards?: boolean;
    },
  ) {
    const profile = await this.getProfile(userId);
    const cycleId = profile.activeCycleId;
    const existingReset = await this.db.growthReset.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: data.idempotencyKey } },
    });
    if (existingReset) return existingReset;

    return this.db.$transaction(async (tx) => {
      let targetCycleId = cycleId;

      if (data.scope === GrowthResetScope.SKILL) {
        if (!data.skillId) throw new Error('skillId is required for SKILL reset');
        const skill = await tx.growthSkill.findFirst({ where: { id: data.skillId, userId } });
        if (!skill) throw new Error('Skill not found');
        const xpAgg = await tx.growthLedgerEntry.aggregate({
          where: { userId, skillId: data.skillId, cycleId, currency: GrowthCurrency.SKILL_XP },
          _sum: { amount: true },
        });
        const currentXp = xpAgg._sum.amount ?? 0;
        if (currentXp > 0) {
          await tx.growthLedgerEntry.create({
            data: {
              id: createUlid(), userId, currency: GrowthCurrency.SKILL_XP, skillId: skill.id,
              amount: -currentXp, kind: GrowthLedgerKind.RESET_ADJUSTMENT,
              sourceType: 'ADMINISTRATIVE_RESET', sourceId: skill.id,
              entryKey: `reset:skill:${skill.id}:${data.idempotencyKey}`, cycleId,
              titleSnapshot: `Reset ${skill.name} progress`,
            },
          });
        }
      } else if (data.scope === GrowthResetScope.ALL_XP) {
        const skills = await tx.growthSkill.findMany({ where: { userId, archivedAt: null } });
        for (const skill of skills) {
          const xpAgg = await tx.growthLedgerEntry.aggregate({
            where: { userId, skillId: skill.id, cycleId, currency: GrowthCurrency.SKILL_XP },
            _sum: { amount: true },
          });
          const currentXp = xpAgg._sum.amount ?? 0;
          if (currentXp > 0) {
            await tx.growthLedgerEntry.create({
              data: {
                id: createUlid(), userId, currency: GrowthCurrency.SKILL_XP, skillId: skill.id,
                amount: -currentXp, kind: GrowthLedgerKind.RESET_ADJUSTMENT,
                sourceType: 'ADMINISTRATIVE_RESET', sourceId: skill.id,
                entryKey: `reset:all:${skill.id}:${data.idempotencyKey}`, cycleId,
                titleSnapshot: `Reset ${skill.name} progress`,
              },
            });
          }
        }
      } else if (data.scope === GrowthResetScope.FULL) {
        const newCycle = await tx.growthCycle.create({ data: { id: createUlid(), userId } });
        await tx.growthCycle.update({ where: { id: cycleId }, data: { endedAt: new Date() } });
        await tx.growthProfile.update({ where: { id: profile.id }, data: { activeCycleId: newCycle.id } });
        targetCycleId = newCycle.id;

        const coinAgg = await tx.growthLedgerEntry.aggregate({
          where: { userId, currency: GrowthCurrency.COIN },
          _sum: { amount: true },
        });
        const currentCoins = coinAgg._sum.amount ?? 0;
        if (currentCoins > 0) {
          await tx.growthLedgerEntry.create({
            data: {
              id: createUlid(), userId, currency: GrowthCurrency.COIN,
              amount: -currentCoins, kind: GrowthLedgerKind.RESET_ADJUSTMENT,
              sourceType: 'ADMINISTRATIVE_RESET', sourceId: 'coins',
              entryKey: `reset:coins:${data.idempotencyKey}`, cycleId: newCycle.id,
              titleSnapshot: 'Full reset coin balance',
            },
          });
        }
        if (data.keepEarningRules === false) await this.upsertStandardPresetInTx(tx, userId, profile.id);
      }

      return tx.growthReset.create({
        data: {
          id: createUlid(), userId, cycleId: targetCycleId, scope: data.scope,
          skillId: data.skillId ?? null, idempotencyKey: data.idempotencyKey,
          keepEarningRules: data.keepEarningRules ?? true,
          keepShopRewards: data.keepShopRewards ?? true,
        },
      });
    });
  }

  private async upsertStandardPresetInTx(tx: Prisma.TransactionClient, userId: string, profileId: string) {
    const presetDefs = REWARD_PRESETS[GrowthRewardPreset.STANDARD];
    await tx.growthProfile.update({ where: { id: profileId }, data: { rewardPreset: GrowthRewardPreset.STANDARD } });
    const activeSkills = await tx.growthSkill.findMany({ where: { userId, archivedAt: null } });
    const tasks = await tx.task.findMany({ where: { userId, deletedAt: null }, select: { id: true } });
    for (const task of tasks) await this.upsertRule(tx, userId, GrowthSourceType.TASK, task.id, presetDefs[GrowthSourceType.TASK], activeSkills);
    const habits = await tx.habit.findMany({ where: { userId, archivedAt: null }, select: { id: true } });
    for (const habit of habits) await this.upsertRule(tx, userId, GrowthSourceType.HABIT, habit.id, presetDefs[GrowthSourceType.HABIT], activeSkills);
    const focusPresets = await tx.focusPreset.findMany({ where: { userId }, select: { id: true } });
    for (const preset of focusPresets) await this.upsertRule(tx, userId, GrowthSourceType.FOCUS_PRESET, preset.id, presetDefs[GrowthSourceType.FOCUS_PRESET], activeSkills);
    const decks = await tx.deck.findMany({ where: { userId, archived: false }, select: { id: true } });
    for (const deck of decks) await this.upsertRule(tx, userId, GrowthSourceType.REVIEW_DECK, deck.id, presetDefs[GrowthSourceType.REVIEW_DECK], activeSkills);
  }
}
