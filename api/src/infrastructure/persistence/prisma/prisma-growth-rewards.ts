import {
  GrowthRewardPreset,
  GrowthScalingMode,
  GrowthSourceType,
  Prisma,
} from '@prisma/client';
import { REWARD_PRESETS } from '@core/application/use-cases/growth-reward-presets';
import { PrismaService } from './prisma.service';
import { createUlid } from './ulid';

type GrowthRuleSkillAwardInput = { skillId: string; xpReward: number };

type GrowthRuleDefinition = {
  coinReward: number;
  accountXp: number;
  xpRewardPerSkill: number;
  scalingMode: GrowthScalingMode;
  maxRewardCap?: number;
};

export class PrismaGrowthRewards {
  constructor(
    private readonly db: PrismaService,
    private readonly getProfile: (userId: string) => Promise<any>,
  ) {}

  async applyPreset(userId: string, preset: GrowthRewardPreset) {
    const profile = await this.getProfile(userId);
    const presetDefs = await this.rewardPresetDefinitions(userId, preset);
    if (!presetDefs) throw new Error(`Unknown preset ${preset}`);

    await this.db.$transaction(async (tx) => {
      await tx.growthProfile.update({
        where: { id: profile.id },
        data: { rewardPreset: preset },
      });

      const activeSkills = await tx.growthSkill.findMany({
        where: { userId, archivedAt: null },
      });

      const tasks = await tx.task.findMany({ where: { userId, deletedAt: null }, select: { id: true } });
      for (const task of tasks) {
        await this.upsertRuleInTx(tx, userId, GrowthSourceType.TASK, task.id, presetDefs[GrowthSourceType.TASK], activeSkills);
      }

      const habits = await tx.habit.findMany({ where: { userId, archivedAt: null }, select: { id: true } });
      for (const habit of habits) {
        await this.upsertRuleInTx(tx, userId, GrowthSourceType.HABIT, habit.id, presetDefs[GrowthSourceType.HABIT], activeSkills);
      }

      const focusPresets = await tx.focusPreset.findMany({ where: { userId }, select: { id: true } });
      for (const focusPreset of focusPresets) {
        await this.upsertRuleInTx(
          tx,
          userId,
          GrowthSourceType.FOCUS_PRESET,
          focusPreset.id,
          presetDefs[GrowthSourceType.FOCUS_PRESET],
          activeSkills,
        );
      }

      const decks = await tx.deck.findMany({ where: { userId, archived: false }, select: { id: true } });
      for (const deck of decks) {
        await this.upsertRuleInTx(tx, userId, GrowthSourceType.REVIEW_DECK, deck.id, presetDefs[GrowthSourceType.REVIEW_DECK], activeSkills);
      }
    });

    return this.listEarningRules(userId);
  }

  async getRewardPresets(userId: string) {
    const settings = await this.db.growthRewardPresetSetting.findMany({ where: { userId } });
    const result = structuredClone(REWARD_PRESETS);

    for (const setting of settings) {
      result[setting.preset][setting.sourceType] = {
        coinReward: setting.coinReward,
        accountXp: setting.accountXp,
        xpRewardPerSkill: setting.xpRewardPerSkill,
        scalingMode: setting.scalingMode,
        ...(setting.maxRewardCap ? { maxRewardCap: setting.maxRewardCap } : {}),
      };
    }

    return result;
  }

  async updateRewardPreset(
    userId: string,
    preset: GrowthRewardPreset,
    rules: Array<{
      sourceType: GrowthSourceType;
      coinReward: number;
      accountXp?: number;
      xpRewardPerSkill: number;
      scalingMode: GrowthScalingMode;
      maxRewardCap?: number | null;
    }>,
  ) {
    if (!REWARD_PRESETS[preset]) throw new Error(`Unknown preset ${preset}`);

    await this.db.$transaction(async (tx) => {
      for (const rule of rules) {
        if (!REWARD_PRESETS[preset][rule.sourceType]) continue;
        await tx.growthRewardPresetSetting.upsert({
          where: { userId_preset_sourceType: { userId, preset, sourceType: rule.sourceType } },
          create: {
            id: createUlid(),
            userId,
            preset,
            sourceType: rule.sourceType,
            coinReward: Math.max(0, Math.trunc(rule.coinReward)),
            accountXp: Math.max(0, Math.trunc(rule.accountXp ?? rule.xpRewardPerSkill)),
            xpRewardPerSkill: Math.max(0, Math.trunc(rule.xpRewardPerSkill)),
            scalingMode: rule.scalingMode,
            maxRewardCap: rule.maxRewardCap ? Math.max(1, Math.trunc(rule.maxRewardCap)) : null,
          },
          update: {
            coinReward: Math.max(0, Math.trunc(rule.coinReward)),
            accountXp: Math.max(0, Math.trunc(rule.accountXp ?? rule.xpRewardPerSkill)),
            xpRewardPerSkill: Math.max(0, Math.trunc(rule.xpRewardPerSkill)),
            scalingMode: rule.scalingMode,
            maxRewardCap: rule.maxRewardCap ? Math.max(1, Math.trunc(rule.maxRewardCap)) : null,
          },
        });
      }
    });

    return this.getRewardPresets(userId);
  }

  async listTaskRewardDefaults(userId: string) {
    return this.db.growthTaskRewardDefault.findMany({
      where: { userId },
      include: {
        skillAwards: { include: { skill: true } },
        itemAwards: { include: { item: true } },
        taskList: true,
      },
      orderBy: [{ taskListId: 'asc' }],
    });
  }

  async upsertTaskRewardDefault(
    userId: string,
    input: {
      taskListId?: string | null;
      coinReward: number;
      accountXp?: number;
      enabled: boolean;
      skillAwards: Array<{ skillId: string; xpReward: number }>;
      itemAwards?: Array<{ itemId: string; quantity: number }>;
    },
  ) {
    const taskListId = input.taskListId ?? null;
    if (taskListId) {
      const taskList = await this.db.taskList.findFirst({ where: { id: taskListId, userId }, select: { id: true } });
      if (!taskList) throw new Error('Task list not found');
    }

    return this.db.$transaction(async (tx) => {
      const existing = await tx.growthTaskRewardDefault.findFirst({ where: { userId, taskListId } });
      const legacyAccountXp = Math.max(0, ...input.skillAwards.map((award) => Math.trunc(award.xpReward)));
      const accountXp = Math.max(0, Math.trunc(input.accountXp ?? legacyAccountXp));
      const defaults = existing
        ? await tx.growthTaskRewardDefault.update({
            where: { id: existing.id },
            data: {
              coinReward: Math.max(0, Math.trunc(input.coinReward)),
              accountXp,
              enabled: input.enabled,
            },
          })
        : await tx.growthTaskRewardDefault.create({
            data: {
              id: createUlid(),
              userId,
              taskListId,
              coinReward: Math.max(0, Math.trunc(input.coinReward)),
              accountXp,
              enabled: input.enabled,
            },
          });

      await tx.growthTaskRewardDefaultSkill.deleteMany({ where: { defaultId: defaults.id } });
      const activeSkills = await tx.growthSkill.findMany({
        where: { userId, archivedAt: null, id: { in: input.skillAwards.map((award) => award.skillId) } },
        select: { id: true },
      });
      const activeSkillIds = new Set(activeSkills.map((skill) => skill.id));
      const skillAwards = input.skillAwards
        .filter((award) => activeSkillIds.has(award.skillId) && award.xpReward > 0)
        .map((award) => ({
          defaultId: defaults.id,
          skillId: award.skillId,
          xpReward: Math.max(0, Math.trunc(award.xpReward)),
        }));
      if (skillAwards.length) await tx.growthTaskRewardDefaultSkill.createMany({ data: skillAwards });

      await tx.growthTaskRewardDefaultItem.deleteMany({ where: { defaultId: defaults.id } });
      const ownedItems = await tx.growthShopReward.findMany({
        where: {
          userId,
          archivedAt: null,
          id: { in: (input.itemAwards ?? []).map((award) => award.itemId) },
        },
        select: { id: true },
      });
      const ownedItemIds = new Set(ownedItems.map((item) => item.id));
      const itemAwards = (input.itemAwards ?? [])
        .filter((award) => ownedItemIds.has(award.itemId) && award.quantity > 0)
        .map((award) => ({
          defaultId: defaults.id,
          itemId: award.itemId,
          quantity: Math.max(1, Math.trunc(award.quantity)),
        }));
      if (itemAwards.length) await tx.growthTaskRewardDefaultItem.createMany({ data: itemAwards });

      return tx.growthTaskRewardDefault.findUniqueOrThrow({
        where: { id: defaults.id },
        include: {
          skillAwards: { include: { skill: true } },
          itemAwards: { include: { item: true } },
          taskList: true,
        },
      });
    });
  }

  async listEarningRules(userId: string, sourceType?: string, sourceId?: string) {
    return this.db.growthEarningRule.findMany({
      where: {
        userId,
        ...(sourceType ? { sourceType: sourceType as GrowthSourceType } : {}),
        ...(sourceId ? { sourceId } : {}),
      },
      include: {
        skillAwards: { include: { skill: true } },
        itemAwards: { include: { item: true } },
      },
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  async findEarningRule(userId: string, sourceType: string, sourceId: string) {
    return this.db.growthEarningRule.findUnique({
      where: { userId_sourceType_sourceId: { userId, sourceType: sourceType as any, sourceId } },
      include: {
        skillAwards: { include: { skill: true } },
        itemAwards: { include: { item: true } },
      },
    });
  }

  async upsertEarningRule(userId: string, input: any) {
    const ruleId = createUlid();
    const skillAwards = (input.skillAwards ?? []) as GrowthRuleSkillAwardInput[];
    const legacyAccountXp = Math.max(0, ...skillAwards.map((award) => Math.trunc(award.xpReward ?? 0)));
    const accountXp = Math.max(0, Math.trunc(input.accountXp ?? legacyAccountXp));
    return this.db.$transaction(async (tx) => {
      const rule = await tx.growthEarningRule.upsert({
        where: {
          userId_sourceType_sourceId: { userId, sourceType: input.sourceType, sourceId: input.sourceId },
        },
        create: {
          id: ruleId,
          userId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          coinReward: input.coinReward ?? 0,
          accountXp,
          scalingMode: input.scalingMode ?? GrowthScalingMode.FIXED,
          maxRewardCap: input.maxRewardCap ?? null,
          enabled: input.enabled ?? true,
        },
        update: {
          coinReward: input.coinReward,
          accountXp,
          scalingMode: input.scalingMode,
          maxRewardCap: input.maxRewardCap,
          enabled: input.enabled,
        },
      });
      await tx.growthEarningRuleSkill.deleteMany({ where: { ruleId: rule.id } });
      if (input.skillAwards?.length) {
        const ownedSkills = await tx.growthSkill.count({
          where: {
            userId,
            archivedAt: null,
            id: { in: input.skillAwards.map((award: any) => award.skillId) },
          },
        });
        if (ownedSkills !== input.skillAwards.length) throw new Error('One or more progress entries are unavailable');
        await tx.growthEarningRuleSkill.createMany({
          data: input.skillAwards.map((award: any) => ({
            ruleId: rule.id,
            skillId: award.skillId,
            xpReward: award.xpReward,
          })),
        });
      }
      await tx.growthEarningRuleItem.deleteMany({ where: { ruleId: rule.id } });
      if (input.itemAwards?.length) {
        const ownedItems = await tx.growthShopReward.count({
          where: {
            userId,
            archivedAt: null,
            id: { in: input.itemAwards.map((award: any) => award.itemId) },
          },
        });
        if (ownedItems !== input.itemAwards.length) throw new Error('One or more reward items are unavailable');
        await tx.growthEarningRuleItem.createMany({
          data: input.itemAwards.map((award: any) => ({
            ruleId: rule.id,
            itemId: award.itemId,
            quantity: Math.max(1, Math.trunc(award.quantity)),
          })),
        });
      }
      return tx.growthEarningRule.findUniqueOrThrow({
        where: { id: rule.id },
        include: {
          skillAwards: { include: { skill: true } },
          itemAwards: { include: { item: true } },
        },
      });
    });
  }

  private async rewardPresetDefinitions(
    userId: string,
    preset: GrowthRewardPreset,
  ): Promise<
    | Record<GrowthSourceType, GrowthRuleDefinition>
    | undefined
  > {
    const base = REWARD_PRESETS[preset];
    if (!base) return undefined;

    const settings = await this.db.growthRewardPresetSetting.findMany({ where: { userId, preset } });
    if (!settings.length) return base;

    const result = structuredClone(base);
    for (const setting of settings) {
      result[setting.sourceType] = {
        coinReward: setting.coinReward,
        accountXp: setting.accountXp,
        xpRewardPerSkill: setting.xpRewardPerSkill,
        scalingMode: setting.scalingMode,
        ...(setting.maxRewardCap ? { maxRewardCap: setting.maxRewardCap } : {}),
      };
    }
    return result;
  }

  async upsertRuleInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    sourceType: GrowthSourceType,
    sourceId: string,
    def: GrowthRuleDefinition,
    skills: Array<{ id: string; starterKey?: string | null }>,
  ) {
    const currentRule = await tx.growthEarningRule.findUnique({
      where: { userId_sourceType_sourceId: { userId, sourceType, sourceId } },
      include: { skillAwards: { select: { skillId: true } } },
    });
    const rule = await tx.growthEarningRule.upsert({
      where: { userId_sourceType_sourceId: { userId, sourceType, sourceId } },
      create: {
        id: createUlid(),
        userId,
        sourceType,
        sourceId,
        coinReward: def.coinReward,
        accountXp: def.accountXp,
        scalingMode: def.scalingMode,
        maxRewardCap: def.maxRewardCap ?? null,
        enabled: true,
      },
      update: {
        coinReward: def.coinReward,
        accountXp: def.accountXp,
        scalingMode: def.scalingMode,
        maxRewardCap: def.maxRewardCap ?? null,
      },
    });

    await tx.growthEarningRuleSkill.deleteMany({ where: { ruleId: rule.id } });
    const selectedIds = currentRule?.skillAwards.length
      ? new Set(currentRule.skillAwards.map((award) => award.skillId))
      : new Set(skills.filter((skill) => skill.starterKey === 'attribute-general').map((skill) => skill.id));
    const selectedSkills = skills.filter((skill) => selectedIds.has(skill.id));
    if (selectedSkills.length > 0 && def.xpRewardPerSkill > 0) {
      await tx.growthEarningRuleSkill.createMany({
        data: selectedSkills.map((skill) => ({
          ruleId: rule.id,
          skillId: skill.id,
          xpReward: def.xpRewardPerSkill,
        })),
      });
    }
  }
}
