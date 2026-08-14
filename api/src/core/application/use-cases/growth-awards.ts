import {
  GrowthAttributeMappingSlot,
  GrowthCurrency,
  GrowthLedgerKind,
  GrowthProgressKind,
  GrowthSourceType,
  GrowthScalingMode,
} from '@prisma/client';
import { createUlid } from '@core/application/ulid';
import { growthLevelProgress } from './growth-rules';
import {
  allocateSkillBudget,
  allocateWeightedAmount,
  lifecycleOrdinal,
  scaledAccountXp,
  scaledSkillXp,
  type AwardScalingContext,
} from './growth-award-calculations';
export type { AwardScalingContext } from './growth-award-calculations';

type Tx = Record<string, any>;
type AttributeMappingWithAttribute = {
  id: string;
  skillId: string;
  attributeId: string;
  slot: GrowthAttributeMappingSlot;
  weight: number;
  attribute: {
    id: string;
    name: string;
    kind: GrowthProgressKind;
    archivedAt: Date | null;
    baseXp: number;
    icon: string;
    color: string;
  };
};
type JsonObject = Record<string, unknown>;
type LedgerEntryInput = {
  userId: string;
  currency: GrowthCurrency;
  skillId?: string | null;
  amount: number;
  kind: GrowthLedgerKind;
  sourceType: GrowthSourceType | string;
  sourceId: string;
  entryKey: string;
  reversalOfId?: string;
  cycleId?: string | null;
  titleSnapshot: string;
  metadata?: JsonObject;
};

export interface GrowthAwardReceipt {
  sourceType: GrowthSourceType;
  sourceId: string;
  title: string;
  reversed?: boolean;
  receiptKey: string;
  progressAwards: Array<{
    progressId: string;
    awardType: 'SKILL' | 'ATTRIBUTE';
    name: string;
    kind: string;
    icon: string;
    color: string;
    xpGained: number;
    beforeXp: number;
    afterXp: number;
    beforeLevel: number;
    afterLevel: number;
    nextLevelXp: number;
    derivedFromSkillId?: string;
    mappingSnapshot?: Array<{
      mappingId: string;
      skillId: string;
      attributeId: string;
      slot: GrowthAttributeMappingSlot;
      weight: number;
    }>;
  }>;
  accountAward?: {
    amount: number;
    beforeXp: number;
    afterXp: number;
    beforeLevel: number;
    afterLevel: number;
    nextLevelXp: number;
  } | null;
  coinAward: { amount: number; balanceAfter: number } | null;
  itemAwards: Array<{
    itemId: string;
    name: string;
    icon: string;
    color: string;
    quantity: number;
    inventoryQuantityAfter: number;
  }>;
}

export async function awardGrowthActivity(
  tx: Tx,
  userId: string,
  sourceType: GrowthSourceType,
  ruleSourceId: string,
  title: string,
  metadata: JsonObject = {},
  activitySourceId = ruleSourceId,
  scalingContext?: AwardScalingContext,
): Promise<boolean> {
  const result = await awardGrowthActivityInternal(
    tx,
    userId,
    sourceType,
    ruleSourceId,
    title,
    metadata,
    activitySourceId,
    scalingContext,
    false,
  );
  return result.created;
}

export async function awardGrowthActivityWithReceipt(
  tx: Tx,
  userId: string,
  sourceType: GrowthSourceType,
  ruleSourceId: string,
  title: string,
  metadata: JsonObject = {},
  activitySourceId = ruleSourceId,
  scalingContext?: AwardScalingContext,
): Promise<GrowthAwardReceipt | null> {
  const result = await awardGrowthActivityInternal(
    tx,
    userId,
    sourceType,
    ruleSourceId,
    title,
    metadata,
    activitySourceId,
    scalingContext,
    true,
  );
  return result.receipt;
}

async function awardGrowthActivityInternal(
  tx: Tx,
  userId: string,
  sourceType: GrowthSourceType,
  ruleSourceId: string,
  title: string,
  metadata: JsonObject,
  activitySourceId: string,
  scalingContext: AwardScalingContext | undefined,
  includeReceipt: boolean,
): Promise<{ created: boolean; receipt: GrowthAwardReceipt | null }> {
  const rule = await tx.growthEarningRule.findUnique({
    where: { userId_sourceType_sourceId: { userId, sourceType, sourceId: ruleSourceId } },
    include: {
      skillAwards: { include: { skill: true } },
      itemAwards: { include: { item: true } },
    },
  });
  if (!rule?.enabled) return { created: false, receipt: null };

  // Get active cycle if profile exists
  const profile = await tx.growthProfile.findUnique({ where: { userId } });
  const cycleId = profile?.activeCycleId ?? null;

  // Count existing reversals for this activity to handle re-completion lifecycle
  const reversalRows = tx.growthLedgerEntry.findMany
    ? await tx.growthLedgerEntry.findMany({
        where: { userId, sourceType, sourceId: activitySourceId, kind: GrowthLedgerKind.REVERSAL },
        select: { entryKey: true, metadata: true, reversalOf: { select: { entryKey: true } } },
      })
    : [];

  const extractLifecycleKey = (row: any, originalKeyOverride?: string): string => {
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
    if (typeof metadata.lifecycleOrdinal === 'number') {
      return `lc${metadata.lifecycleOrdinal}`;
    }
    const key = originalKeyOverride ?? row.reversalOf?.entryKey ?? '';
    const match = key.match(/:lc(\d+):/);
    return match ? `lc${match[1]}` : 'lc0';
  };

  const reversalLifecycles = new Set(
    reversalRows.map((row: any) => extractLifecycleKey(row)),
  );
  // Inventory-only awards have no ledger reversal row. Include their
  // compensating transactions in the same lifecycle set, keyed by the
  // original inventory award's entry key so mixed currency/item reversals
  // still count as one lifecycle.
  if (tx.growthInventoryTransaction?.findMany) {
    const inventoryRows = await tx.growthInventoryTransaction.findMany({
      where: { userId, sourceType, sourceId: activitySourceId },
      select: { id: true, kind: true, entryKey: true, metadata: true },
    });
    const awardKeys = new Map<string, string>(
      inventoryRows
        .filter((row: any) => row.kind !== 'REVERSAL')
        .map((row: any) => [row.id, row.entryKey] as const),
    );
    for (const row of inventoryRows) {
      if (row.kind !== 'REVERSAL') continue;
      const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
      const originalId = typeof metadata.originalTransactionId === 'string' ? metadata.originalTransactionId : undefined;
      const originalKey = originalId ? awardKeys.get(originalId) ?? '' : '';
      reversalLifecycles.add(extractLifecycleKey(row, originalKey));
    }
  }
  const reversalsCount = reversalLifecycles.size ? reversalLifecycles.size : await tx.growthLedgerEntry.count({
    where: { userId, sourceType, sourceId: activitySourceId, currency: GrowthCurrency.ACCOUNT_XP, kind: GrowthLedgerKind.REVERSAL },
  });
  const lifecycleKey = reversalsCount > 0 ? `:lc${reversalsCount}` : '';

  let created = false;
  const progressAwards: GrowthAwardReceipt['progressAwards'] = [];
  let accountAward: GrowthAwardReceipt['accountAward'] = null;
  const itemAwards: GrowthAwardReceipt['itemAwards'] = [];
  let coinAward: GrowthAwardReceipt['coinAward'] = null;
  const weightedAwards = rule.skillAwards
    .map((award: any) => ({
      ...award,
      xpAmount: scaledSkillXp(award.xpReward, rule.scalingMode, rule.maxRewardCap, sourceType, scalingContext),
    }))
    .filter((award: any) => award.xpAmount > 0)
    .sort((a: any, b: any) => a.skillId.localeCompare(b.skillId));
  // accountXp is the fixed event budget. Per-skill values are weights only;
  // legacy rows are populated during the additive migration.
  const accountBudget = scaledAccountXp(rule.accountXp, rule.scalingMode, rule.maxRewardCap, sourceType, scalingContext);
  const selectedAwards = weightedAwards.filter((award: any) => !award.skill.archivedAt).slice(0, 3);
  const allocations = allocateSkillBudget(accountBudget, selectedAwards);
  const mappingsBySkill = await loadAttributeMappings(tx, userId, selectedAwards.map((award: any) => award.skillId));

  for (const [index, award] of selectedAwards.entries()) {
    const xpAmount = allocations[index] ?? 0;
    if (xpAmount <= 0) continue;

    const beforeAggregate = includeReceipt
      ? await tx.growthLedgerEntry.aggregate({
          where: {
            userId,
            skillId: award.skillId,
            currency: GrowthCurrency.SKILL_XP,
            ...(cycleId ? { cycleId } : {}),
          },
          _sum: { amount: true },
        })
      : null;
    const entryKey = `award:${sourceType}:${activitySourceId}${lifecycleKey}:skill:${award.skillId}`;
    const skillCreated = await createLedgerOnce(tx, {
      userId,
      currency: GrowthCurrency.SKILL_XP,
      skillId: award.skillId,
      amount: xpAmount,
      kind: GrowthLedgerKind.ACTIVITY_AWARD,
      sourceType,
      sourceId: activitySourceId,
      entryKey,
      cycleId,
      titleSnapshot: title,
      metadata: {
        ...metadata,
        skillName: award.skill.name,
        scalingMode: rule.scalingMode,
        maxRewardCap: rule.maxRewardCap,
        accountBudget,
        allocationWeight: award.xpAmount,
      },
    });
    created = skillCreated || created;
    if (includeReceipt && skillCreated) {
      const beforeXp = Math.max(0, beforeAggregate?._sum.amount ?? 0);
      const afterXp = beforeXp + xpAmount;
      const before = growthLevelProgress(beforeXp, award.skill.baseXp);
      const after = growthLevelProgress(afterXp, award.skill.baseXp);
      progressAwards.push({
        progressId: award.skill.id,
        awardType: award.skill.kind === GrowthProgressKind.ATTRIBUTE ? 'ATTRIBUTE' : 'SKILL',
        name: award.skill.name,
        kind: award.skill.kind,
        icon: award.skill.icon,
        color: award.skill.color,
        xpGained: xpAmount,
        beforeXp,
        afterXp,
        beforeLevel: before.level,
        afterLevel: after.level,
        nextLevelXp: after.nextLevelXp,
      });
    }

    // Attribute routing is derived only from SKILL awards. Direct ATTRIBUTE
    // awards continue to be represented by the original ledger row and never
    // fan out again.
    if (skillCreated && award.skill.kind === GrowthProgressKind.SKILL) {
      const mappings = mappingsBySkill.get(award.skillId) ?? [];
      const derivedAllocations = allocateWeightedAmount(xpAmount, mappings);
      for (const [mappingIndex, mapping] of mappings.entries()) {
        const attributeXp = derivedAllocations[mappingIndex] ?? 0;
        if (attributeXp <= 0) continue;
        const attributeEntryKey = `${entryKey}:attribute:${mapping.attributeId}`;
        // Read the balance before inserting the derived row so receipt
        // `beforeXp` excludes the award being reported.
        const beforeAggregate = includeReceipt
          ? await tx.growthLedgerEntry.aggregate({
              where: {
                userId,
                skillId: mapping.attributeId,
                currency: GrowthCurrency.SKILL_XP,
                ...(cycleId ? { cycleId } : {}),
              },
              _sum: { amount: true },
            })
          : null;
        const attributeCreated = await createLedgerOnce(tx, {
          userId,
          currency: GrowthCurrency.SKILL_XP,
          skillId: mapping.attributeId,
          amount: attributeXp,
          kind: GrowthLedgerKind.ACTIVITY_AWARD,
          sourceType,
          sourceId: activitySourceId,
          entryKey: attributeEntryKey,
          cycleId,
          titleSnapshot: title,
          metadata: {
            ...metadata,
            awardType: 'ATTRIBUTE',
            derivedFromSkillId: award.skillId,
            derivedFromSkillEntryKey: entryKey,
            mappingSnapshot: mappings.map((route) => ({
              mappingId: route.id,
              skillId: route.skillId,
              attributeId: route.attributeId,
              slot: route.slot,
              weight: route.weight,
            })),
          },
        });
        created = attributeCreated || created;
        if (includeReceipt && attributeCreated) {
          const beforeXp = Math.max(0, beforeAggregate?._sum.amount ?? 0);
          const afterXp = beforeXp + attributeXp;
          const before = growthLevelProgress(beforeXp, mapping.attribute.baseXp);
          const after = growthLevelProgress(afterXp, mapping.attribute.baseXp);
          progressAwards.push({
            progressId: mapping.attribute.id,
            awardType: 'ATTRIBUTE',
            name: mapping.attribute.name,
            kind: mapping.attribute.kind,
            icon: mapping.attribute.icon,
            color: mapping.attribute.color,
            xpGained: attributeXp,
            derivedFromSkillId: award.skillId,
            mappingSnapshot: mappings.map((route) => ({
              mappingId: route.id,
              skillId: route.skillId,
              attributeId: route.attributeId,
              slot: route.slot,
              weight: route.weight,
            })),
            beforeXp,
            afterXp,
            beforeLevel: before.level,
            afterLevel: after.level,
            nextLevelXp: after.nextLevelXp,
          });
        }
      }
    }
  }

  if (accountBudget > 0) {
    const beforeAggregate = includeReceipt
      ? await tx.growthLedgerEntry.aggregate({
          where: { userId, currency: GrowthCurrency.ACCOUNT_XP },
          _sum: { amount: true },
        })
      : null;
    const entryKey = `award:${sourceType}:${activitySourceId}${lifecycleKey}:account`;
    const accountCreated = await createLedgerOnce(tx, {
      userId,
      currency: GrowthCurrency.ACCOUNT_XP,
      amount: accountBudget,
      kind: GrowthLedgerKind.ACTIVITY_AWARD,
      sourceType,
      sourceId: activitySourceId,
      entryKey,
      cycleId,
      titleSnapshot: title,
      metadata: { ...metadata, accountBudget, skillCount: selectedAwards.length },
    });
    created = accountCreated || created;
    if (accountCreated && profile && tx.growthProfile?.update) {
      const lifetimeAfter = (profile.lifetimeEarnedXp ?? 0) + accountBudget;
      const reached = growthLevelProgress(lifetimeAfter, profile.accountBaseXp).level;
      const updatedProfile = await tx.growthProfile.update({
        where: { userId },
        data: {
          lifetimeEarnedXp: { increment: accountBudget },
          highestLevelReached: Math.max(profile.highestLevelReached ?? 1, reached),
          protectedLevelFloor: Math.max(profile.protectedLevelFloor ?? 1, reached),
        },
      });
      if (updatedProfile && tx.syncChange?.create) {
        await tx.syncChange.create({
          data: {
            userId,
            entityType: 'growthprofile',
            entityId: updatedProfile.id ?? profile.id,
            operation: 'UPSERT',
            data: updatedProfile,
          },
        });
      }
    }
    if (includeReceipt && accountCreated) {
      const beforeXp = Math.max(0, beforeAggregate?._sum.amount ?? 0);
      const afterXp = beforeXp + accountBudget;
      const before = growthLevelProgress(beforeXp, profile?.accountBaseXp ?? 75);
      const after = growthLevelProgress(afterXp, profile?.accountBaseXp ?? 75);
      accountAward = {
        amount: accountBudget,
        beforeXp,
        afterXp,
        beforeLevel: before.level,
        afterLevel: after.level,
        nextLevelXp: after.nextLevelXp,
      };
    }
  }

  if (rule.coinReward > 0) {
    let coinAmount = rule.coinReward;
    if (rule.scalingMode === GrowthScalingMode.LINEAR && sourceType === GrowthSourceType.REVIEW_DECK) {
      const count = scalingContext?.reviewedCount ?? 1;
      coinAmount = rule.coinReward * count;
      if (rule.maxRewardCap != null && rule.maxRewardCap > 0) {
        coinAmount = Math.min(coinAmount, rule.maxRewardCap);
      }
    }

    if (coinAmount > 0) {
      const beforeCoinBalance = includeReceipt
        ? await tx.growthLedgerEntry.aggregate({
            where: { userId, currency: GrowthCurrency.COIN },
            _sum: { amount: true },
          })
        : null;
      const entryKey = `award:${sourceType}:${activitySourceId}${lifecycleKey}:coin`;
      const coinCreated = await createLedgerOnce(tx, {
        userId,
        currency: GrowthCurrency.COIN,
        amount: coinAmount,
        kind: GrowthLedgerKind.ACTIVITY_AWARD,
        sourceType,
        sourceId: activitySourceId,
        entryKey,
        cycleId,
        titleSnapshot: title,
        metadata,
      });
      created = coinCreated || created;
      if (includeReceipt && coinCreated) {
        coinAward = {
          amount: coinAmount,
          balanceAfter: (beforeCoinBalance?._sum.amount ?? 0) + coinAmount,
        };
      }
    }
  }

  for (const award of rule.itemAwards ?? []) {
    if (award.quantity <= 0 || award.item.archivedAt) continue;
    const entryKey = `inventory:award:${sourceType}:${activitySourceId}${lifecycleKey}:item:${award.itemId}`;
    const transaction = await tx.growthInventoryTransaction.createMany({
      data: [
        {
          id: createUlid(),
          userId,
          itemId: award.itemId,
          quantity: award.quantity,
          kind: sourceType === GrowthSourceType.TASK ? 'TASK_AWARD' : 'ADJUSTMENT',
          sourceType,
          sourceId: activitySourceId,
          entryKey,
          metadata,
        },
      ],
      skipDuplicates: true,
    });
    if (!transaction.count) continue;
    created = true;
    const inventoryEntry = await tx.growthInventoryTransaction.findUniqueOrThrow({
      where: { userId_entryKey: { userId, entryKey } },
    });
    await tx.syncChange.create({
      data: {
        userId,
        entityType: 'growthinventorytransaction',
        entityId: inventoryEntry.id,
        operation: 'UPSERT',
        data: inventoryEntry,
      },
    });
    if (includeReceipt) {
      const balance = await tx.growthInventoryTransaction.aggregate({
        where: { userId, itemId: award.itemId },
        _sum: { quantity: true },
      });
      itemAwards.push({
        itemId: award.item.id,
        name: award.item.name,
        icon: award.item.icon,
        color: award.item.color,
        quantity: award.quantity,
        inventoryQuantityAfter: balance._sum.quantity ?? 0,
      });
    }
  }

  const receipt =
    progressAwards.length || accountAward || coinAward || itemAwards.length
      ? {
          sourceType,
          sourceId: activitySourceId,
          title,
          receiptKey: `earned:${sourceType}:${activitySourceId}:lc${reversalsCount}`,
          progressAwards,
          accountAward,
          coinAward,
          itemAwards,
        }
      : null;
  return { created, receipt };
}

async function loadAttributeMappings(
  tx: Tx,
  userId: string,
  skillIds: string[],
): Promise<Map<string, AttributeMappingWithAttribute[]>> {
  if (!tx.growthAttributeMapping?.findMany || skillIds.length === 0) {
    return new Map<string, AttributeMappingWithAttribute[]>();
  }
  const rows = await tx.growthAttributeMapping.findMany({
    where: { userId, skillId: { in: skillIds } },
    include: { attribute: true },
    orderBy: [{ skillId: 'asc' }, { slot: 'asc' }, { id: 'asc' }],
  });
  const result = new Map<string, AttributeMappingWithAttribute[]>();
  for (const row of rows) {
    if (row.attribute?.kind !== GrowthProgressKind.ATTRIBUTE || row.attribute?.archivedAt) continue;
    const routes = result.get(row.skillId) ?? [];
    routes.push(row);
    result.set(row.skillId, routes);
  }
  return result;
}

export async function reverseGrowthActivity(
  tx: Tx,
  userId: string,
  sourceType: GrowthSourceType,
  sourceId: string,
  title: string,
): Promise<boolean> {
  return (await reverseGrowthActivityInternal(tx, userId, sourceType, sourceId, title)).created;
}

export async function reverseGrowthActivityWithReceipt(
  tx: Tx,
  userId: string,
  sourceType: GrowthSourceType,
  sourceId: string,
  title: string,
): Promise<GrowthAwardReceipt | null> {
  const result = await reverseGrowthActivityInternal(tx, userId, sourceType, sourceId, title);
  if (!result.created) return null;
  return {
    sourceType,
    sourceId,
    title,
    reversed: true,
    receiptKey: `reverted:${sourceType}:${sourceId}:lc${result.lifecycleOrdinal}`,
    progressAwards: [],
    accountAward: null,
    coinAward: null,
    itemAwards: [],
  };
}

async function reverseGrowthActivityInternal(
  tx: Tx,
  userId: string,
  sourceType: GrowthSourceType,
  sourceId: string,
  title: string,
): Promise<{ created: boolean; lifecycleOrdinal: number }> {
  const [awards, inventoryAwards] = await Promise.all([
    tx.growthLedgerEntry.findMany({
      where: { userId, sourceType, sourceId, kind: GrowthLedgerKind.ACTIVITY_AWARD },
    }),
    tx.growthInventoryTransaction.findMany({
      where: {
        userId,
        sourceType,
        sourceId,
        kind: { in: ['TASK_AWARD', 'ADJUSTMENT'] },
        quantity: { gt: 0 },
      },
    }),
  ]);
  let created = false;
  let createdLifecycleOrdinal = 0;
  for (const award of awards) {
    const ledgerCreated = await createLedgerOnce(tx, {
      userId,
      currency: award.currency,
      skillId: award.skillId,
      amount: -award.amount,
      kind: GrowthLedgerKind.REVERSAL,
      sourceType,
      sourceId,
      entryKey: `reverse:${award.id}`,
      reversalOfId: award.id,
      cycleId: award.cycleId,
      titleSnapshot: title,
      metadata: {
        originalEntryId: award.id,
        lifecycleOrdinal: lifecycleOrdinal(award.entryKey),
      },
    });
    if (ledgerCreated) createdLifecycleOrdinal = lifecycleOrdinal(award.entryKey);
    created = ledgerCreated || created;
  }
  for (const award of inventoryAwards) {
    const result = await tx.growthInventoryTransaction.createMany({
      data: [
        {
          id: createUlid(),
          userId,
          itemId: award.itemId,
          quantity: -award.quantity,
          kind: 'REVERSAL',
          sourceType,
          sourceId,
          entryKey: `inventory:reverse:${award.id}`,
          metadata: { originalTransactionId: award.id, title },
        },
      ],
      skipDuplicates: true,
    });
    if (!result.count) continue;
    const reversal = await tx.growthInventoryTransaction.findUniqueOrThrow({
      where: { userId_entryKey: { userId, entryKey: `inventory:reverse:${award.id}` } },
    });
    await tx.syncChange.create({
      data: {
        userId,
        entityType: 'growthinventorytransaction',
        entityId: reversal.id,
        operation: 'UPSERT',
        data: reversal,
      },
    });
    created = true;
    createdLifecycleOrdinal = lifecycleOrdinal(award.entryKey);
  }
  return { created, lifecycleOrdinal: createdLifecycleOrdinal };
}

async function createLedgerOnce(
  tx: Tx,
  data: LedgerEntryInput,
): Promise<boolean> {
  const result = await tx.growthLedgerEntry.createMany({ data: [{ id: createUlid(), ...data }], skipDuplicates: true });
  if (result.count) {
    const entry = await tx.growthLedgerEntry.findUniqueOrThrow({
      where: { userId_entryKey: { userId: data.userId, entryKey: data.entryKey } },
    });
    await tx.syncChange.create({
      data: {
        userId: data.userId,
        entityType: 'growthledgerentry',
        entityId: entry.id,
        operation: 'UPSERT',
        data: entry,
      },
    });
  }
  return result.count === 1;
}
