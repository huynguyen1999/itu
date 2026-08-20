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

export class PrismaSyncGrowthCoreMutations {
  protected async getOrCreateGrowthProfileInTx(tx: Tx, userId: string) {
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

  protected async applyGrowthEarningRule(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
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

  protected async applyGrowthAttributeMappings(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
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

  protected async applyGrowthRewardRedemption(tx: Tx, userId: string, mutation: SyncMutation): Promise<void> {
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


}
