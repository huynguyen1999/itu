import { Injectable } from '@nestjs/common';
import { GrowthAttributeMappingsInput, IGrowthRepository } from '@core/application/ports/out/repositories.port';
import { PrismaService } from './prisma.service';
import { createUlid } from './ulid';
import {
  GrowthCurrency,
  GrowthLedgerKind,
  GrowthOnboardingState,
  GrowthProgressKind,
  GrowthResetScope,
  GrowthRewardPreset,
  GrowthScalingMode,
  GrowthSourceType,
  Prisma,
} from '@prisma/client';
import { growthLevelProgress } from '@core/application/use-cases/growth-rules';
import { awardGrowthActivity, reverseGrowthActivity } from '@core/application/use-cases/growth-awards';
import { ensureStarterSkills } from '@core/application/use-cases/ensure-starter-skills';
import { REWARD_PRESETS } from '@core/application/use-cases/growth-reward-presets';
import { PrismaGrowthShop } from './prisma-growth-shop';
import { PrismaGrowthResets } from './prisma-growth-resets';
import { InvalidGrowthMappingException } from '@core/domain/exceptions';
import { recordChange as recordSyncChange } from './prisma-sync-handler.port';

type GrowthRuleSkillAwardInput = { skillId: string; xpReward: number };

@Injectable()
export class PrismaGrowthRepository implements IGrowthRepository {
  private readonly resets: PrismaGrowthResets;

  constructor(
    private readonly db: PrismaService,
    private readonly shop: PrismaGrowthShop,
  ) {
    this.resets = new PrismaGrowthResets(
      db,
      (userId) => this.getOrCreateProfile(userId),
      (tx, userId, sourceType, sourceId, definition, skills) => this.upsertRuleInTx(tx, userId, sourceType, sourceId, definition, skills),
    );
  }

  async getOrCreateProfile(userId: string) {
    let profile = await this.db.growthProfile.findUnique({
      where: { userId },
      include: { activeCycle: true },
    });
    if (!profile) {
      const cycleId = createUlid();
      const profileId = createUlid();
      await this.db.$transaction(async (tx) => {
        const cycle = await tx.growthCycle.create({
          data: { id: cycleId, userId },
        });
        profile = await tx.growthProfile.create({
          data: {
            id: profileId,
            userId,
            activeCycleId: cycle.id,
            onboardingState: GrowthOnboardingState.NOT_STARTED,
            accountBaseXp: 75,
            rewardPreset: GrowthRewardPreset.STANDARD,
          },
          include: { activeCycle: true },
        });
      });
    }
    await this.ensureStarterEntries(userId, profile!.id, profile!.activeCycleId);
    return this.db.growthProfile.findUniqueOrThrow({
      where: { userId },
      include: { activeCycle: true },
    });
  }

  private async ensureStarterEntries(userId: string, profileId: string, activeCycleId: string) {
    // Starter seeding performs many sequential writes on first run; the default
    // 5s interactive-transaction timeout is too tight and aborts mid-seed.
    await this.db.$transaction(
      async (tx) => {
        await ensureStarterSkills(tx, userId, activeCycleId, { markProfileOnboarding: { profileId } });
      },
      { timeout: 20000 },
    );
  }

  async updateProfile(userId: string, data: { accountBaseXp?: number; rewardPreset?: GrowthRewardPreset }) {
    const profile = await this.getOrCreateProfile(userId);
    const updateData: Prisma.GrowthProfileUpdateInput = {};
    if (data.accountBaseXp !== undefined) {
      updateData.accountBaseXp = Math.max(10, Math.min(10000, Math.trunc(data.accountBaseXp)));
    }
    if (data.rewardPreset !== undefined) {
      updateData.rewardPreset = data.rewardPreset;
    }
    return this.db.growthProfile.update({
      where: { id: profile.id },
      data: updateData,
      include: { activeCycle: true },
    });
  }

  async completeOnboarding(userId: string, selectedSkills: Array<{ key: string; customName?: string }>) {
    const profile = await this.getOrCreateProfile(userId);
    void selectedSkills;
    await this.ensureStarterEntries(userId, profile.id, profile.activeCycleId);
    return this.listSkills(userId);
  }

  async applyPreset(userId: string, preset: GrowthRewardPreset) {
    const profile = await this.getOrCreateProfile(userId);
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

      // Tasks
      const tasks = await tx.task.findMany({ where: { userId, deletedAt: null }, select: { id: true } });
      for (const t of tasks) {
        const def = presetDefs[GrowthSourceType.TASK];
        await this.upsertRuleInTx(tx, userId, GrowthSourceType.TASK, t.id, def, activeSkills);
      }

      // Habits
      const habits = await tx.habit.findMany({ where: { userId, archivedAt: null }, select: { id: true } });
      for (const h of habits) {
        const def = presetDefs[GrowthSourceType.HABIT];
        await this.upsertRuleInTx(tx, userId, GrowthSourceType.HABIT, h.id, def, activeSkills);
      }

      // Focus presets
      const fPresets = await tx.focusPreset.findMany({ where: { userId }, select: { id: true } });
      for (const fp of fPresets) {
        const def = presetDefs[GrowthSourceType.FOCUS_PRESET];
        await this.upsertRuleInTx(tx, userId, GrowthSourceType.FOCUS_PRESET, fp.id, def, activeSkills);
      }

      // Decks
      const decks = await tx.deck.findMany({ where: { userId, archived: false }, select: { id: true } });
      for (const d of decks) {
        const def = presetDefs[GrowthSourceType.REVIEW_DECK];
        await this.upsertRuleInTx(tx, userId, GrowthSourceType.REVIEW_DECK, d.id, def, activeSkills);
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

  private async rewardPresetDefinitions(
    userId: string,
    preset: GrowthRewardPreset,
  ): Promise<
    | Record<
        GrowthSourceType,
        { coinReward: number; accountXp: number; xpRewardPerSkill: number; scalingMode: GrowthScalingMode; maxRewardCap?: number }
      >
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

  private async upsertRuleInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    sourceType: GrowthSourceType,
    sourceId: string,
    def: { coinReward: number; accountXp: number; xpRewardPerSkill: number; scalingMode: GrowthScalingMode; maxRewardCap?: number },
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

  async overview(userId: string) {
    const profile = await this.getOrCreateProfile(userId);
    const activeCycleId = profile.activeCycleId;

    const [skills, accountXp, coin, recentLedger] = await Promise.all([
      this.db.growthSkill.findMany({
        where: { userId, archivedAt: null },
        include: {
          ledgerEntries: {
            where: { cycleId: activeCycleId, currency: GrowthCurrency.SKILL_XP },
            select: { amount: true },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.db.growthLedgerEntry.aggregate({
        where: { userId, currency: GrowthCurrency.ACCOUNT_XP },
        _sum: { amount: true },
      }),
      this.db.growthLedgerEntry.aggregate({
        where: { userId, currency: GrowthCurrency.COIN },
        _sum: { amount: true },
      }),
      this.db.growthLedgerEntry.findMany({
        where: { userId },
        include: { skill: { select: { name: true, kind: true, icon: true, color: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 12,
      }),
    ]);

    const skillProgress = skills.map(({ ledgerEntries, baseXp, ...skill }) => {
      const xp = ledgerEntries.reduce((sum, entry) => sum + entry.amount, 0);
      return { ...skill, ...growthLevelProgress(xp, baseXp) };
    });

    const positiveAccountXp = await this.db.growthLedgerEntry.aggregate({
      where: { userId, currency: GrowthCurrency.ACCOUNT_XP, kind: GrowthLedgerKind.ACTIVITY_AWARD, amount: { gt: 0 } },
      _sum: { amount: true },
    });
    const lifetimeEarnedXp = Math.max(profile.lifetimeEarnedXp ?? 0, positiveAccountXp._sum.amount ?? 0);
    const outstandingPenaltyDebt = profile.outstandingPenaltyDebt ?? 0;
    const protectedLevelFloor = profile.protectedLevelFloor ?? 1;
    const highestLevelReached = profile.highestLevelReached ?? 1;
    const floorXp = profile.accountBaseXp * Math.max(0, protectedLevelFloor - 1) ** 2;
    // The current account XP is the net ledger balance, which already nets
    // activity reversals (undo) and commitment penalties. Using the never-
    // decreasing lifetimeEarnedXp here would keep earned XP (and the level bar)
    // inflated after an activity is undone.
    const activityAccountXp = (accountXp._sum.amount ?? 0) + outstandingPenaltyDebt;
    const netAccountXp = Math.max(
      0,
      activityAccountXp - Math.min(outstandingPenaltyDebt, Math.max(0, activityAccountXp - floorXp)),
    );

    return {
      account: {
        ...growthLevelProgress(netAccountXp, profile.accountBaseXp),
        coinBalance: coin._sum.amount ?? 0,
        lifetimeEarnedXp,
        outstandingPenaltyDebt,
        highestLevelReached,
        protectedLevelFloor,
      },
      profile,
      skills: skillProgress,
      recentLedger,
    };
  }

  async listSkills(userId: string, includeArchived = false, kind?: GrowthProgressKind) {
    const profile = await this.getOrCreateProfile(userId);
    const skills = await this.db.growthSkill.findMany({
      where: { userId, ...(kind ? { kind } : {}), ...(includeArchived ? {} : { archivedAt: null }) },
      include: {
        ledgerEntries: {
          where: { cycleId: profile.activeCycleId, currency: GrowthCurrency.SKILL_XP },
          select: { amount: true },
        },
      },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return skills.map(({ ledgerEntries, baseXp, ...skill }) => {
      const xp = ledgerEntries.reduce((sum, entry) => sum + entry.amount, 0);
      return { ...skill, ...growthLevelProgress(xp, baseXp) };
    });
  }

  async findSkillById(userId: string, id: string) {
    return this.db.growthSkill.findFirst({ where: { id, userId } });
  }

  async createSkill(userId: string, input: any) {
    const profile = await this.getOrCreateProfile(userId);
    return this.db.growthSkill.create({
      data: {
        id: createUlid(),
        userId,
        cycleId: profile.activeCycleId,
        kind: input.kind ?? GrowthProgressKind.SKILL,
        name: input.name.trim(),
        description: input.description ?? '',
        icon: input.icon ?? 'SPARKLES',
        color: input.color ?? 'TEAL',
        baseXp: input.baseXp ?? 100,
      },
    });
  }

  async updateSkill(userId: string, id: string, input: any) {
    const existing = await this.findSkillById(userId, id);
    if (!existing) return null;
    const data: Prisma.GrowthSkillUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.icon !== undefined) data.icon = input.icon;
    if (input.color !== undefined) data.color = input.color;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.baseXp !== undefined) data.baseXp = Math.max(10, Math.min(10000, Math.trunc(input.baseXp)));
    if (input.archived !== undefined) {
      // The legacy system General attribute is historical-only.  It may be
      // queried with includeArchived, but can never be reactivated for awards.
      data.archivedAt = existing.starterKey === 'attribute-general' ? new Date() : input.archived ? new Date() : null;
    }
    if (input.kind !== undefined) data.kind = input.kind;

    return this.db.growthSkill.update({
      where: { id },
      data,
    });
  }

  async deleteSkill(userId: string, id: string) {
    const existing = await this.db.growthSkill.findFirst({ where: { id, userId }, select: { id: true, starterKey: true } });
    if (!existing) return false;
    const ledgerCount = await this.db.growthLedgerEntry.count({ where: { userId, skillId: id } });
    if (existing.starterKey === 'attribute-general' || ledgerCount > 0) {
      await this.db.growthSkill.update({ where: { id }, data: { archivedAt: new Date() } });
      return true;
    }
    const deleted = await this.db.growthSkill.deleteMany({ where: { id, userId } });
    return deleted.count > 0;
  }

  async reorderSkills(userId: string, skillIds: string[]) {
    const owned = await this.db.growthSkill.findMany({
      where: { userId, id: { in: skillIds } },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((entry) => entry.id));
    await this.db.$transaction(
      skillIds
        .filter((id) => ownedIds.has(id))
        .map((id, index) => this.db.growthSkill.update({ where: { id }, data: { sortOrder: index } })),
    );
    return this.listSkills(userId, true);
  }

  async listAttributeMappings(userId: string, skillId?: string) {
    return this.db.growthAttributeMapping.findMany({
      where: {
        userId,
        ...(skillId ? { skillId } : {}),
        skill: { archivedAt: null },
        attribute: { archivedAt: null },
      },
      include: {
        skill: { select: { id: true, name: true, kind: true, archivedAt: true } },
        attribute: { select: { id: true, name: true, kind: true, icon: true, color: true, archivedAt: true } },
      },
      orderBy: [{ skillId: 'asc' }, { slot: 'asc' }],
    });
  }

  async upsertAttributeMappings(
    userId: string,
    input: GrowthAttributeMappingsInput,
  ) {
    const mappings = input.mappings ?? [];
    if (mappings.length < 1 || mappings.length > 2) throw new InvalidGrowthMappingException('A skill requires one primary and an optional secondary mapping');
    const primary = mappings.filter((mapping) => mapping.slot === 'PRIMARY');
    const secondary = mappings.filter((mapping) => mapping.slot === 'SECONDARY');
    if (primary.length !== 1 || secondary.length > 1) throw new InvalidGrowthMappingException('A skill may have one primary and one secondary mapping');
    if (primary[0].weight < 70 || primary[0].weight > 100) throw new InvalidGrowthMappingException('Primary mapping weight must be between 70 and 100');
    if (secondary.length && (secondary[0].weight < 1 || secondary[0].weight > 30)) {
      throw new InvalidGrowthMappingException('Secondary mapping weight must be between 1 and 30');
    }
    if (mappings.reduce((sum, mapping) => sum + Math.trunc(mapping.weight), 0) !== 100) {
      throw new InvalidGrowthMappingException('Mapping weights must total 100');
    }
    if (new Set(mappings.map((mapping) => mapping.attributeId)).size !== mappings.length) {
      throw new InvalidGrowthMappingException('A skill cannot map to the same attribute twice');
    }

    return this.db.$transaction(async (tx) => {
      const skill = await tx.growthSkill.findFirst({ where: { id: input.skillId, userId } });
      if (!skill || skill.kind !== GrowthProgressKind.SKILL || skill.archivedAt) {
        throw new InvalidGrowthMappingException('Skill not found or unavailable');
      }
      const attributes = await tx.growthSkill.findMany({
        where: {
          userId,
          kind: GrowthProgressKind.ATTRIBUTE,
          archivedAt: null,
          id: { in: mappings.map((mapping) => mapping.attributeId) },
        },
        select: { id: true },
      });
      if (attributes.length !== mappings.length) throw new InvalidGrowthMappingException('One or more attributes are unavailable');

      await tx.growthAttributeMapping.deleteMany({ where: { userId, skillId: input.skillId } });
      await tx.growthAttributeMapping.createMany({
        data: mappings.map((mapping) => ({
          id: createUlid(),
          userId,
          skillId: input.skillId,
          attributeId: mapping.attributeId,
          slot: mapping.slot,
          weight: Math.trunc(mapping.weight),
        })),
      });
      const full = await tx.growthAttributeMapping.findMany({
        where: { userId, skillId: input.skillId },
        include: {
          skill: { select: { id: true, name: true, kind: true, archivedAt: true } },
          attribute: { select: { id: true, name: true, kind: true, icon: true, color: true, archivedAt: true } },
        },
        orderBy: [{ slot: 'asc' }],
      });
      await recordSyncChange(tx, userId, 'growthattributemapping', input.skillId, 'UPSERT', full);
      return full;
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

  async listLedger(userId: string, options?: any) {
    const where: Prisma.GrowthLedgerEntryWhereInput = { userId };
    if (options?.cycleId) where.cycleId = options.cycleId;
    if (options?.sourceType) where.sourceType = options.sourceType;
    if (options?.currency) where.currency = options.currency;
    if (options?.skillId) where.skillId = options.skillId;
    if (options?.kind) where.kind = options.kind;
    if (options?.fromDate || options?.toDate) {
      where.createdAt = {
        ...(options.fromDate ? { gte: new Date(options.fromDate) } : {}),
        ...(options.toDate ? { lte: new Date(options.toDate) } : {}),
      };
    }
    return this.db.growthLedgerEntry.findMany({
      where,
      include: { skill: { select: { name: true, kind: true, icon: true, color: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options?.limit ?? 50,
    });
  }

  async growthStatistics(userId: string, from: Date, to: Date) {
    const entries = await this.db.growthLedgerEntry.findMany({
      where: {
        userId,
        currency: GrowthCurrency.SKILL_XP,
        createdAt: { gte: from, lt: to },
      },
      select: {
        amount: true,
        createdAt: true,
        skillId: true,
        skill: {
          select: {
            name: true,
            kind: true,
            icon: true,
            color: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const trend = new Map<string, number>();
    const attributes = new Map<string, {
      skillId: string;
      name: string;
      icon: string;
      color: string;
      gained: number;
      lost: number;
      net: number;
      changes: number;
    }>();

    for (const entry of entries) {
      const date = entry.createdAt.toISOString().slice(0, 10);
      trend.set(date, (trend.get(date) ?? 0) + Math.max(0, entry.amount));

      if (!entry.skillId || entry.skill?.kind !== GrowthProgressKind.ATTRIBUTE) continue;
      const current = attributes.get(entry.skillId) ?? {
        skillId: entry.skillId,
        name: entry.skill.name,
        icon: entry.skill.icon,
        color: entry.skill.color,
        gained: 0,
        lost: 0,
        net: 0,
        changes: 0,
      };
      current.gained += Math.max(0, entry.amount);
      current.lost += Math.abs(Math.min(0, entry.amount));
      current.net += entry.amount;
      current.changes += 1;
      attributes.set(entry.skillId, current);
    }

    return {
      totalXp: entries.reduce((sum, entry) => sum + Math.max(0, entry.amount), 0),
      trend: [...trend].map(([date, xp]) => ({ date, xp })),
      attributes: [...attributes.values()].sort((a, b) => b.net - a.net || a.name.localeCompare(b.name)),
    };
  }

  previewReset(userId: string, scope: GrowthResetScope, skillId?: string) {
    return this.resets.previewReset(userId, scope, skillId);
  }

  executeReset(
    userId: string,
    data: {
      scope: GrowthResetScope;
      skillId?: string;
      idempotencyKey: string;
      keepEarningRules?: boolean;
      keepShopRewards?: boolean;
    },
  ) {
    return this.resets.executeReset(userId, data);
  }

  // ─── Shop / Rewards ────────────────────────────────────────────────────────

  async listShopRewards(userId: string, includeArchived = false) {
    return this.shop.listRewards(userId, includeArchived);
  }

  async createShopReward(userId: string, input: any) {
    return this.shop.createReward(userId, input);
  }

  async updateShopReward(userId: string, id: string, input: any) {
    return this.shop.updateReward(userId, id, input);
  }

  async deleteShopReward(userId: string, id: string) {
    return this.shop.deleteReward(userId, id);
  }

  async reorderShopRewards(userId: string, rewardIds: string[]) {
    return this.shop.reorderRewards(userId, rewardIds);
  }

  // ─── Redemptions ────────────────────────────────────────────────────────────

  async listRedemptions(userId: string, options?: any) {
    return this.shop.listRedemptions(userId, options);
  }

  async redeemShopReward(userId: string, rewardId: string) {
    return this.shop.redeemReward(userId, rewardId);
  }

  // ─── Item Categories ────────────────────────────────────────────────────────

  async listItemCategories(userId: string, includeArchived = false) {
    return this.shop.listCategories(userId, includeArchived);
  }

  async createItemCategory(userId: string, input: any) {
    return this.shop.createCategory(userId, input);
  }

  async updateItemCategory(userId: string, id: string, input: any) {
    return this.shop.updateCategory(userId, id, input);
  }

  async reorderItemCategories(userId: string, categoryIds: string[]) {
    return this.shop.reorderCategories(userId, categoryIds);
  }

  // ─── Inventory ──────────────────────────────────────────────────────────────

  async listInventory(userId: string) {
    return this.shop.listInventory(userId);
  }

  async listInventoryHistory(userId: string, options?: any) {
    return this.shop.listInventoryHistory(userId, options);
  }

  async consumeInventoryItem(userId: string, itemId: string, idempotencyKey: string) {
    return this.shop.consumeInventoryItem(userId, itemId, idempotencyKey);
  }

  async awardActivity(
    userId: string,
    sourceType: any,
    ruleSourceId: string,
    title: string,
    metadata?: any,
    activitySourceId?: string,
  ) {
    return this.db.$transaction((tx) =>
      awardGrowthActivity(tx, userId, sourceType, ruleSourceId, title, metadata, activitySourceId),
    );
  }

  async reverseActivity(userId: string, sourceType: any, sourceId: string, title: string) {
    return this.db.$transaction((tx) => reverseGrowthActivity(tx, userId, sourceType, sourceId, title));
  }
}
