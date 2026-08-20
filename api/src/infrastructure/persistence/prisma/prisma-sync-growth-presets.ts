import { Tx, recordSyncChange } from './prisma-sync-mutation.shared';
import {
  GrowthAttributeMappingSlot,
  GrowthProgressKind,
  GrowthRewardPreset,
  GrowthScalingMode,
  GrowthSourceType,
} from '@prisma/client';
import { SyncConflict, SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import { InvalidSyncMutationException } from '@core/domain/exceptions';
import { createUlid } from './ulid';
import { STARTER_SKILLS } from '@core/application/use-cases/growth-starter-skills';
import { REWARD_PRESETS } from '@core/application/use-cases/growth-reward-presets';
import {
  assertClientId,
  awardsArray,
  enumValue,
  fieldConflict,
  notFound,
  optionalString,
  requiredString,
  validatedGrowthInt,
} from './prisma-sync.helpers';

import { PrismaSyncGrowthCoreMutations } from './prisma-sync-growth-core-mutations';

export class PrismaSyncGrowthPresets extends PrismaSyncGrowthCoreMutations {
  protected async applyGrowthInventoryConsume(tx: Tx, userId: string, mutation: SyncMutation): Promise<void> {
    const item = await tx.growthShopReward.findFirst({ where: { id: mutation.entityId, userId, archivedAt: null } });
    if (!item) throw new InvalidSyncMutationException('Inventory item is not available');
    const idempotencyKey = requiredString(mutation.payload, 'idempotencyKey');
    const existing = await tx.growthInventoryTransaction.findUnique({
      where: { userId_entryKey: { userId, entryKey: `inventory:consume:${idempotencyKey}` } },
    });
    if (existing) return;
    const balance = await tx.growthInventoryTransaction.aggregate({
      where: { userId, itemId: item.id },
      _sum: { quantity: true },
    });
    if ((balance._sum.quantity ?? 0) <= 0) throw new InvalidSyncMutationException('No inventory available');
    const transaction = await tx.growthInventoryTransaction.create({
      data: {
        id: createUlid(),
        userId,
        itemId: item.id,
        quantity: -1,
        kind: 'CONSUMPTION',
        sourceType: 'INVENTORY_USE',
        sourceId: item.id,
        entryKey: `inventory:consume:${idempotencyKey}`,
      },
    });
    await recordSyncChange(tx, userId, 'growthinventorytransaction', transaction.id, 'UPSERT', transaction);
  }

  protected async applyGrowthRewardPresetUpdate(tx: Tx, userId: string, mutation: SyncMutation): Promise<void> {
    const preset = enumValue(GrowthRewardPreset, mutation.payload.preset, 'preset');
    const rules = Array.isArray(mutation.payload.rules) ? mutation.payload.rules : [];
    for (const rule of rules) {
      if (typeof rule !== 'object' || rule === null) continue;
      const record = rule as Record<string, unknown>;
      const sourceType = enumValue(GrowthSourceType, record.sourceType, 'sourceType');
      const coinReward = validatedGrowthInt(record.coinReward, 'coinReward', { min: 0, max: 1_000_000 }) ?? 0;
      const xpRewardPerSkill = validatedGrowthInt(record.xpRewardPerSkill, 'xpRewardPerSkill', { min: 0, max: 1_000_000 }) ?? 0;
      const accountXpValue = validatedGrowthInt(record.accountXp, 'accountXp', { min: 0, max: 1_000_000 });
      const accountXp = accountXpValue ?? xpRewardPerSkill;
      const maxRewardCap = validatedGrowthInt(record.maxRewardCap, 'maxRewardCap', { min: 1 }) ?? null;
      await tx.growthRewardPresetSetting.upsert({
        where: { userId_preset_sourceType: { userId, preset, sourceType } },
        create: {
          id: createUlid(),
          userId,
          preset,
          sourceType,
          coinReward,
          accountXp,
          xpRewardPerSkill,
          scalingMode:
            record.scalingMode === undefined
              ? GrowthScalingMode.FIXED
              : enumValue(GrowthScalingMode, record.scalingMode, 'scalingMode'),
          maxRewardCap,
        },
        update: {
          coinReward,
          accountXp,
          xpRewardPerSkill,
          scalingMode:
            record.scalingMode === undefined
              ? GrowthScalingMode.FIXED
              : enumValue(GrowthScalingMode, record.scalingMode, 'scalingMode'),
          maxRewardCap,
        },
      });
    }
  }

  protected async applyGrowthTaskRewardDefault(tx: Tx, userId: string, mutation: SyncMutation): Promise<void> {
    const taskListId = optionalString(mutation.payload, 'taskListId');
    if (taskListId) {
      const list = await tx.taskList.findFirst({ where: { id: taskListId, userId, archivedAt: null } });
      if (!list) throw new InvalidSyncMutationException('Task list is unavailable');
    }
    const existing = await tx.growthTaskRewardDefault.findFirst({ where: { userId, taskListId } });
    const skillAwards = awardsArray(mutation.payload, 'skillAwards');
    const legacyAccountXp = Math.max(0, ...skillAwards.map((award) => award.amount));
    const accountXp =
      validatedGrowthInt(mutation.payload.accountXp, 'accountXp', { min: 0, max: 1_000_000 }) ?? legacyAccountXp;
    const coinReward =
      validatedGrowthInt(mutation.payload.coinReward, 'coinReward', { min: 0, max: 1_000_000 }) ?? 0;
    const defaults = existing
      ? await tx.growthTaskRewardDefault.update({
          where: { id: existing.id },
          data: {
            coinReward,
            accountXp,
            enabled: typeof mutation.payload.enabled === 'boolean' ? mutation.payload.enabled : true,
          },
        })
      : await tx.growthTaskRewardDefault.create({
          data: {
            id: createUlid(),
            userId,
            taskListId,
            coinReward,
            accountXp,
            enabled: typeof mutation.payload.enabled === 'boolean' ? mutation.payload.enabled : true,
          },
        });
    await tx.growthTaskRewardDefaultSkill.deleteMany({ where: { defaultId: defaults.id } });
    if (skillAwards.length) {
      const owned = await tx.growthSkill.count({
        where: { userId, archivedAt: null, id: { in: skillAwards.map((award) => award.id) } },
      });
      if (owned !== skillAwards.length)
        throw new InvalidSyncMutationException('One or more progress entries are unavailable');
      await tx.growthTaskRewardDefaultSkill.createMany({
        data: skillAwards
          .filter((award) => award.amount > 0)
          .map((award) => ({ defaultId: defaults.id, skillId: award.id, xpReward: award.amount })),
      });
    }
    await tx.growthTaskRewardDefaultItem.deleteMany({ where: { defaultId: defaults.id } });
    const itemAwards = awardsArray(mutation.payload, 'itemAwards');
    if (itemAwards.length) {
      const owned = await tx.growthShopReward.count({
        where: { userId, archivedAt: null, id: { in: itemAwards.map((award) => award.id) } },
      });
      if (owned !== itemAwards.length) throw new InvalidSyncMutationException('One or more reward items are unavailable');
      await tx.growthTaskRewardDefaultItem.createMany({
        data: itemAwards.map((award) => ({ defaultId: defaults.id, itemId: award.id, quantity: award.amount })),
      });
    }
    await recordSyncChange(tx, userId, 'growthtaskrewarddefault', defaults.id, 'UPSERT', defaults);
  }

  protected async applyGrowthPreset(tx: Tx, userId: string, mutation: SyncMutation): Promise<void> {
    const preset = enumValue(GrowthRewardPreset, mutation.payload.preset, 'preset');
    const profile = await this.getOrCreateGrowthProfileInTx(tx, userId);
    const updatedProfile = await tx.growthProfile.update({ where: { id: profile.id }, data: { rewardPreset: preset } });
    await recordSyncChange(tx, userId, 'growthprofile', updatedProfile.id, 'UPSERT', updatedProfile);

    const settings = await tx.growthRewardPresetSetting.findMany({ where: { userId, preset } });
    const presetDefinitions = { ...REWARD_PRESETS[preset] };
    for (const setting of settings) {
      presetDefinitions[setting.sourceType] = {
        coinReward: setting.coinReward,
        accountXp: setting.accountXp,
        xpRewardPerSkill: setting.xpRewardPerSkill,
        scalingMode: setting.scalingMode,
        maxRewardCap: setting.maxRewardCap ?? undefined,
      };
    }

    const activeSkills = await tx.growthSkill.findMany({ where: { userId, archivedAt: null } });
    const tasks = await tx.task.findMany({ where: { userId, deletedAt: null }, select: { id: true } });
    for (const task of tasks) {
      await this.upsertPresetGrowthRule(
        tx,
        userId,
        GrowthSourceType.TASK,
        task.id,
        presetDefinitions[GrowthSourceType.TASK],
        activeSkills,
      );
    }
    const habits = await tx.habit.findMany({ where: { userId, archivedAt: null }, select: { id: true } });
    for (const habit of habits) {
      await this.upsertPresetGrowthRule(
        tx,
        userId,
        GrowthSourceType.HABIT,
        habit.id,
        presetDefinitions[GrowthSourceType.HABIT],
        activeSkills,
      );
    }
    const focusPresets = await tx.focusPreset.findMany({ where: { userId }, select: { id: true } });
    for (const focusPreset of focusPresets) {
      await this.upsertPresetGrowthRule(
        tx,
        userId,
        GrowthSourceType.FOCUS_PRESET,
        focusPreset.id,
        presetDefinitions[GrowthSourceType.FOCUS_PRESET],
        activeSkills,
      );
    }
    const decks = await tx.deck.findMany({ where: { userId, archived: false }, select: { id: true } });
    for (const deck of decks) {
      await this.upsertPresetGrowthRule(
        tx,
        userId,
        GrowthSourceType.REVIEW_DECK,
        deck.id,
        presetDefinitions[GrowthSourceType.REVIEW_DECK],
        activeSkills,
      );
    }
  }

  protected async upsertPresetGrowthRule(
    tx: Tx,
    userId: string,
    sourceType: GrowthSourceType,
    sourceId: string,
    preset: { coinReward: number; accountXp: number; xpRewardPerSkill: number; scalingMode: GrowthScalingMode; maxRewardCap?: number },
    activeSkills: Array<{ id: string }>,
  ): Promise<void> {
    const rule = await tx.growthEarningRule.upsert({
      where: { userId_sourceType_sourceId: { userId, sourceType, sourceId } },
      create: {
        id: createUlid(),
        userId,
        sourceType,
        sourceId,
        coinReward: preset.coinReward,
        accountXp: preset.accountXp,
        scalingMode: preset.scalingMode,
        maxRewardCap: preset.maxRewardCap ?? null,
        enabled: true,
      },
      update: {
        coinReward: preset.coinReward,
        accountXp: preset.accountXp,
        scalingMode: preset.scalingMode,
        maxRewardCap: preset.maxRewardCap ?? null,
        enabled: true,
        version: { increment: 1 },
      },
    });
    await tx.growthEarningRuleSkill.deleteMany({ where: { ruleId: rule.id } });
    if (preset.xpRewardPerSkill > 0 && activeSkills.length) {
      await tx.growthEarningRuleSkill.createMany({
        data: activeSkills.map((skill) => ({
          ruleId: rule.id,
          skillId: skill.id,
          xpReward: preset.xpRewardPerSkill,
        })),
      });
    }
    await recordSyncChange(tx, userId, 'growthearningrule', rule.id, 'UPSERT', rule);
  }

}

