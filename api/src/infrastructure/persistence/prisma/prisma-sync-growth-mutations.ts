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
export { conflictingSyncFields } from './prisma-sync.helpers';


export class PrismaSyncGrowthMutations {
  readonly kinds: readonly string[] = ["growth.onboarding","growthprofile.update","growthskill.create","growthskill.update","growthattributemapping.upsert","growthearningrule.upsert","growthshopreward.create","growthshopreward.update","growthshopreward.redeem","growthitemcategory.create","growthitemcategory.update","growthinventory.consume","growthrewardpreset.update","growthtaskrewarddefault.upsert","growthpreset.apply"];
  async applyMutation(
    tx: Tx,
    userId: string,
    mutation: SyncMutation,
    outcome: { growthReceipt?: unknown },
  ): Promise<SyncConflict | null | undefined> {
    const payload = mutation.payload;
    switch (mutation.kind) {
      case 'growth.onboarding': {
        const profile = await this.getOrCreateGrowthProfileInTx(tx, userId);
        const skills = Array.isArray(payload.skills) ? payload.skills : [];
        const existing = await tx.growthSkill.findMany({ where: { userId }, select: { starterKey: true } });
        const existingKeys = new Set(existing.map((skill) => skill.starterKey).filter(Boolean));
        for (const item of skills) {
          if (typeof item !== 'object' || item === null) continue;
          const key = (item as { key?: unknown }).key;
          if (typeof key !== 'string' || existingKeys.has(key)) continue;
          const starter = STARTER_SKILLS.find((entry) => entry.key === key);
          if (!starter) continue;
          const skill = await tx.growthSkill.create({
            data: {
              id: createUlid(),
              userId,
              cycleId: profile.activeCycleId,
              kind: starter.kind,
              starterKey: starter.key,
              name: optionalString(item as Record<string, unknown>, 'customName') ?? starter.name,
              description: starter.description,
              icon: starter.icon,
              color: starter.color,
              baseXp: 100,
              sortOrder: STARTER_SKILLS.findIndex((entry) => entry.key === starter.key),
            },
          });
          await recordSyncChange(tx, userId, 'growthskill', skill.id, 'UPSERT', skill);
        }
        const updatedProfile = await tx.growthProfile.update({
          where: { id: profile.id },
          data: { onboardingState: 'COMPLETED' },
        });
        await recordSyncChange(tx, userId, 'growthprofile', updatedProfile.id, 'UPSERT', updatedProfile);
        return null;
      }
      case 'growthprofile.update': {
        const profile = await this.getOrCreateGrowthProfileInTx(tx, userId);
        const updated = await tx.growthProfile.update({
          where: { id: profile.id },
          data: {
            accountBaseXp:
              typeof payload.accountBaseXp === 'number'
                ? Math.max(10, Math.min(10000, Math.trunc(payload.accountBaseXp)))
                : profile.accountBaseXp,
            rewardPreset:
              payload.rewardPreset === undefined
                ? profile.rewardPreset
                : enumValue(GrowthRewardPreset, payload.rewardPreset, 'rewardPreset'),
          },
        });
        await recordSyncChange(tx, userId, 'growthprofile', updated.id, 'UPSERT', updated);
        return null;
      }
      case 'growthskill.create': {
        assertClientId(mutation.entityId);
        const profile = await this.getOrCreateGrowthProfileInTx(tx, userId);
        const skill = await tx.growthSkill.upsert({
          where: { id: mutation.entityId },
          create: {
            id: mutation.entityId,
            userId,
            cycleId: profile.activeCycleId,
            kind:
              payload.kind === undefined
                ? GrowthProgressKind.SKILL
                : enumValue(GrowthProgressKind, payload.kind, 'kind'),
            name: requiredString(payload, 'name'),
            description: optionalString(payload, 'description') ?? '',
            icon: optionalString(payload, 'icon') ?? 'SPARKLES',
            color: optionalString(payload, 'color') ?? 'TEAL',
            baseXp:
              typeof payload.baseXp === 'number' ? Math.max(10, Math.min(10000, Math.trunc(payload.baseXp))) : 100,
            sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : 0,
          },
          update: {},
        });
        await recordSyncChange(tx, userId, 'growthskill', skill.id, 'UPSERT', skill);
        return null;
      }
      case 'growthskill.update': {
        const skill = await tx.growthSkill.findFirst({ where: { id: mutation.entityId, userId } });
        if (!skill) return notFound(mutation, 'growthskill');
        const conflict = fieldConflict(mutation, 'growthskill', skill);
        if (conflict) return conflict;
        const updated = await tx.growthSkill.update({
          where: { id: skill.id },
          data: {
            name: optionalString(payload, 'name') ?? skill.name,
            description:
              payload.description === undefined ? skill.description : (optionalString(payload, 'description') ?? ''),
            icon: optionalString(payload, 'icon') ?? skill.icon,
            color: optionalString(payload, 'color') ?? skill.color,
            sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : skill.sortOrder,
            baseXp:
              typeof payload.baseXp === 'number'
                ? Math.max(10, Math.min(10000, Math.trunc(payload.baseXp)))
                : skill.baseXp,
            kind: payload.kind === undefined ? skill.kind : enumValue(GrowthProgressKind, payload.kind, 'kind'),
            archivedAt:
              typeof payload.archived === 'boolean' ? (payload.archived ? new Date() : null) : skill.archivedAt,
            version: { increment: 1 },
          },
        });
        await recordSyncChange(tx, userId, 'growthskill', updated.id, 'UPSERT', updated);
        return null;
      }
      case 'growthattributemapping.upsert':
        return this.applyGrowthAttributeMappings(tx, userId, mutation);
      case 'growthearningrule.upsert':
        return this.applyGrowthEarningRule(tx, userId, mutation);
      case 'growthshopreward.create': {
        assertClientId(mutation.entityId);
        const reward = await tx.growthShopReward.upsert({
          where: { id: mutation.entityId },
          create: {
            id: mutation.entityId,
            userId,
            name: requiredString(payload, 'name'),
            description: optionalString(payload, 'description') ?? '',
            icon: optionalString(payload, 'icon') ?? 'GIFT',
            color: optionalString(payload, 'color') ?? 'ROSE',
            price: typeof payload.price === 'number' ? Math.trunc(payload.price) : null,
            listedInShop: typeof payload.listedInShop === 'boolean' ? payload.listedInShop : payload.price != null,
            repeatable: typeof payload.repeatable === 'boolean' ? payload.repeatable : true,
            sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : 0,
            categoryId: optionalString(payload, 'categoryId'),
          },
          update: {},
          include: { category: true, _count: { select: { redemptions: true } } },
        });
        await recordSyncChange(tx, userId, 'growthshopreward', reward.id, 'UPSERT', reward);
        return null;
      }
      case 'growthshopreward.update': {
        const reward = await tx.growthShopReward.findFirst({ where: { id: mutation.entityId, userId } });
        if (!reward) return notFound(mutation, 'growthshopreward');
        const conflict = fieldConflict(mutation, 'growthshopreward', reward);
        if (conflict) return conflict;
        const updated = await tx.growthShopReward.update({
          where: { id: reward.id },
          data: {
            name: optionalString(payload, 'name') ?? reward.name,
            description:
              payload.description === undefined ? reward.description : (optionalString(payload, 'description') ?? ''),
            icon: optionalString(payload, 'icon') ?? reward.icon,
            color: optionalString(payload, 'color') ?? reward.color,
            price:
              payload.price === undefined
                ? reward.price
                : typeof payload.price === 'number'
                  ? Math.trunc(payload.price)
                  : null,
            listedInShop: typeof payload.listedInShop === 'boolean' ? payload.listedInShop : reward.listedInShop,
            repeatable: typeof payload.repeatable === 'boolean' ? payload.repeatable : reward.repeatable,
            sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : reward.sortOrder,
            categoryId: payload.categoryId === undefined ? reward.categoryId : optionalString(payload, 'categoryId'),
            archivedAt:
              typeof payload.archived === 'boolean' ? (payload.archived ? new Date() : null) : reward.archivedAt,
            version: { increment: 1 },
          },
          include: { category: true, _count: { select: { redemptions: true } } },
        });
        await recordSyncChange(tx, userId, 'growthshopreward', updated.id, 'UPSERT', updated);
        return null;
      }
      case 'growthshopreward.redeem':
        await this.applyGrowthRewardRedemption(tx, userId, mutation);
        return null;
      case 'growthitemcategory.create': {
        assertClientId(mutation.entityId);
        const category = await tx.growthItemCategory.upsert({
          where: { id: mutation.entityId },
          create: {
            id: mutation.entityId,
            userId,
            name: requiredString(payload, 'name'),
            sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : 0,
          },
          update: {},
          include: { _count: { select: { items: true } } },
        });
        await recordSyncChange(tx, userId, 'growthitemcategory', category.id, 'UPSERT', category);
        return null;
      }
      case 'growthitemcategory.update': {
        const category = await tx.growthItemCategory.findFirst({ where: { id: mutation.entityId, userId } });
        if (!category) return notFound(mutation, 'growthitemcategory');
        const conflict = fieldConflict(mutation, 'growthitemcategory', category);
        if (conflict) return conflict;
        const updated = await tx.growthItemCategory.update({
          where: { id: category.id },
          data: {
            name: optionalString(payload, 'name') ?? category.name,
            sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : category.sortOrder,
            archivedAt:
              typeof payload.archived === 'boolean' ? (payload.archived ? new Date() : null) : category.archivedAt,
            version: { increment: 1 },
          },
          include: { _count: { select: { items: true } } },
        });
        await recordSyncChange(tx, userId, 'growthitemcategory', updated.id, 'UPSERT', updated);
        return null;
      }
      case 'growthinventory.consume':
        await this.applyGrowthInventoryConsume(tx, userId, mutation);
        return null;
      case 'growthrewardpreset.update':
        await this.applyGrowthRewardPresetUpdate(tx, userId, mutation);
        return null;
      case 'growthtaskrewarddefault.upsert':
        await this.applyGrowthTaskRewardDefault(tx, userId, mutation);
        return null;
      case 'growthpreset.apply':
        await this.applyGrowthPreset(tx, userId, mutation);
        return null;
      default:
        return undefined;
    }
  }

  private async getOrCreateGrowthProfileInTx(tx: Tx, userId: string) {
    const existing = await tx.growthProfile.findUnique({ where: { userId } });
    if (existing) return existing;
    const cycle = await tx.growthCycle.create({ data: { id: createUlid(), userId } });
    return tx.growthProfile.create({
      data: {
        id: createUlid(),
        userId,
        activeCycleId: cycle.id,
      },
    });
  }

  private async applyGrowthEarningRule(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    const payload = mutation.payload;
    const sourceType = enumValue(GrowthSourceType, payload.sourceType, 'sourceType');
    const sourceId = requiredString(payload, 'sourceId');
    const skillAwards = awardsArray(payload, 'skillAwards');
    const legacyAccountXp = Math.max(0, ...skillAwards.map((award) => award.amount));
    const accountXp = validatedGrowthInt(payload.accountXp, 'accountXp', { min: 0, max: 1_000_000 }) ?? legacyAccountXp;
    const coinReward = validatedGrowthInt(payload.coinReward, 'coinReward', { min: 0, max: 1_000_000 }) ?? 0;
    const maxRewardCap = validatedGrowthInt(payload.maxRewardCap, 'maxRewardCap', { min: 1 }) ?? null;
    const rule = await tx.growthEarningRule.upsert({
      where: { userId_sourceType_sourceId: { userId, sourceType, sourceId } },
      create: {
        id: createUlid(),
        userId,
        sourceType,
        sourceId,
        coinReward,
        accountXp,
        enabled: typeof payload.enabled === 'boolean' ? payload.enabled : true,
        scalingMode:
          payload.scalingMode === undefined
            ? GrowthScalingMode.FIXED
            : enumValue(GrowthScalingMode, payload.scalingMode, 'scalingMode'),
        maxRewardCap,
      },
      update: {
        coinReward,
        accountXp,
        enabled: typeof payload.enabled === 'boolean' ? payload.enabled : true,
        scalingMode:
          payload.scalingMode === undefined
            ? GrowthScalingMode.FIXED
            : enumValue(GrowthScalingMode, payload.scalingMode, 'scalingMode'),
        maxRewardCap,
        version: { increment: 1 },
      },
    });
    await tx.growthEarningRuleSkill.deleteMany({ where: { ruleId: rule.id } });
    if (skillAwards.length) {
      const owned = await tx.growthSkill.count({
        where: { userId, archivedAt: null, id: { in: skillAwards.map((award) => award.id) } },
      });
      if (owned !== skillAwards.length)
        throw new InvalidSyncMutationException('One or more progress entries are unavailable');
      await tx.growthEarningRuleSkill.createMany({
        data: skillAwards
          .filter((award) => award.amount > 0)
          .map((award) => ({ ruleId: rule.id, skillId: award.id, xpReward: award.amount })),
      });
    }
    await tx.growthEarningRuleItem.deleteMany({ where: { ruleId: rule.id } });
    const itemAwards = awardsArray(payload, 'itemAwards');
    if (itemAwards.length) {
      const owned = await tx.growthShopReward.count({
        where: { userId, archivedAt: null, id: { in: itemAwards.map((award) => award.id) } },
      });
      if (owned !== itemAwards.length)
        throw new InvalidSyncMutationException('One or more reward items are unavailable');
      await tx.growthEarningRuleItem.createMany({
        data: itemAwards.map((award) => ({ ruleId: rule.id, itemId: award.id, quantity: Math.max(1, award.amount) })),
      });
    }
    const full = await tx.growthEarningRule.findUniqueOrThrow({
      where: { id: rule.id },
      include: { skillAwards: { include: { skill: true } }, itemAwards: { include: { item: true } } },
    });
    await recordSyncChange(tx, userId, 'growthearningrule', full.id, 'UPSERT', full);
    return null;
  }

  private async applyGrowthAttributeMappings(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    const payload = mutation.payload;
    const skillId = requiredString(payload, 'skillId');
    if (skillId !== mutation.entityId) {
      throw new InvalidSyncMutationException('skillId must match the mutation entity');
    }
    const rawMappings = payload.mappings;
    if (!Array.isArray(rawMappings) || rawMappings.length < 1 || rawMappings.length > 2) {
      throw new InvalidSyncMutationException('A skill requires one primary and an optional secondary mapping');
    }

    const mappings = rawMappings.map((item) => {
      if (typeof item !== 'object' || item === null) {
        throw new InvalidSyncMutationException('mappings contains an invalid mapping');
      }
      const record = item as Record<string, unknown>;
      const attributeId = requiredString(record, 'attributeId');
      const slot = enumValue(GrowthAttributeMappingSlot, record.slot, 'slot');
      if (typeof record.weight !== 'number' || !Number.isInteger(record.weight)) {
        throw new InvalidSyncMutationException('weight must be an integer');
      }
      return { attributeId, slot, weight: record.weight };
    });
    const primary = mappings.filter((mapping) => mapping.slot === GrowthAttributeMappingSlot.PRIMARY);
    const secondary = mappings.filter((mapping) => mapping.slot === GrowthAttributeMappingSlot.SECONDARY);
    if (primary.length !== 1 || secondary.length > 1) {
      throw new InvalidSyncMutationException('A skill may have one primary and one secondary mapping');
    }
    if (primary[0].weight < 70 || primary[0].weight > 100) {
      throw new InvalidSyncMutationException('Primary mapping weight must be between 70 and 100');
    }
    if (secondary.length && (secondary[0].weight < 1 || secondary[0].weight > 30)) {
      throw new InvalidSyncMutationException('Secondary mapping weight must be between 1 and 30');
    }
    if (mappings.reduce((sum, mapping) => sum + mapping.weight, 0) !== 100) {
      throw new InvalidSyncMutationException('Mapping weights must total 100');
    }
    if (new Set(mappings.map((mapping) => mapping.attributeId)).size !== mappings.length) {
      throw new InvalidSyncMutationException('A skill cannot map to the same attribute twice');
    }

    const skill = await tx.growthSkill.findFirst({ where: { id: skillId, userId } });
    if (!skill || skill.kind !== GrowthProgressKind.SKILL || skill.archivedAt) {
      throw new InvalidSyncMutationException('Skill not found or unavailable');
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
    if (attributes.length !== mappings.length) {
      throw new InvalidSyncMutationException('One or more attributes are unavailable');
    }

    await tx.growthAttributeMapping.deleteMany({ where: { userId, skillId } });
    await tx.growthAttributeMapping.createMany({
      data: mappings.map((mapping) => ({
        id: createUlid(),
        userId,
        skillId,
        attributeId: mapping.attributeId,
        slot: mapping.slot,
        weight: mapping.weight,
      })),
    });
    const full = await tx.growthAttributeMapping.findMany({
      where: { userId, skillId },
      include: {
        skill: { select: { id: true, name: true, kind: true, archivedAt: true } },
        attribute: { select: { id: true, name: true, kind: true, icon: true, color: true, archivedAt: true } },
      },
      orderBy: [{ slot: 'asc' }],
    });
    await recordSyncChange(tx, userId, 'growthattributemapping', skillId, 'UPSERT', full);
    return null;
  }

  private async applyGrowthRewardRedemption(tx: Tx, userId: string, mutation: SyncMutation): Promise<void> {
    const reward = await tx.growthShopReward.findFirst({
      where: { id: mutation.entityId, userId, archivedAt: null, listedInShop: true },
    });
    if (!reward || reward.price == null) throw new InvalidSyncMutationException('Reward is not available');
    const existing = await tx.growthRewardRedemption.findFirst({
      where: { userId, ledgerEntry: { entryKey: `redeem:${mutation.id}` } },
    });
    if (existing) return;
    if (!reward.repeatable) {
      const priorPurchase = await tx.growthRewardRedemption.findFirst({ where: { userId, rewardId: reward.id } });
      if (priorPurchase) throw new InvalidSyncMutationException('This item can only be purchased once');
    }
    const balance = await tx.growthLedgerEntry.aggregate({
      where: { userId, currency: 'COIN' },
      _sum: { amount: true },
    });
    if ((balance._sum.amount ?? 0) < reward.price) throw new InvalidSyncMutationException('Insufficient coins');
    const profile = await this.getOrCreateGrowthProfileInTx(tx, userId);
    const ledger = await tx.growthLedgerEntry.create({
      data: {
        id: createUlid(),
        userId,
        currency: 'COIN',
        amount: -reward.price,
        kind: 'REWARD_PURCHASE',
        sourceType: 'REWARD_REDEMPTION',
        sourceId: reward.id,
        entryKey: `redeem:${mutation.id}`,
        cycleId: profile.activeCycleId,
        titleSnapshot: `Redeemed ${reward.name}`,
      },
    });
    const redemption = await tx.growthRewardRedemption.create({
      data: {
        id: createUlid(),
        userId,
        rewardId: reward.id,
        ledgerEntryId: ledger.id,
        rewardNameSnapshot: reward.name,
        descriptionSnapshot: reward.description,
        priceSnapshot: reward.price,
      },
      include: { reward: { select: { name: true, icon: true, color: true } } },
    });
    const inventory = await tx.growthInventoryTransaction.create({
      data: {
        id: createUlid(),
        userId,
        itemId: reward.id,
        quantity: 1,
        kind: 'PURCHASE',
        sourceType: 'REWARD_REDEMPTION',
        sourceId: redemption.id,
        entryKey: `inventory:purchase:${mutation.id}`,
      },
    });
    await recordSyncChange(tx, userId, 'growthledgerentry', ledger.id, 'UPSERT', ledger);
    await recordSyncChange(tx, userId, 'growthrewardredemption', redemption.id, 'UPSERT', redemption);
    await recordSyncChange(tx, userId, 'growthinventorytransaction', inventory.id, 'UPSERT', inventory);
  }

  private async applyGrowthInventoryConsume(tx: Tx, userId: string, mutation: SyncMutation): Promise<void> {
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

  private async applyGrowthRewardPresetUpdate(tx: Tx, userId: string, mutation: SyncMutation): Promise<void> {
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

  private async applyGrowthTaskRewardDefault(tx: Tx, userId: string, mutation: SyncMutation): Promise<void> {
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

  private async applyGrowthPreset(tx: Tx, userId: string, mutation: SyncMutation): Promise<void> {
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

  private async upsertPresetGrowthRule(
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

