import type { GrowthEarningRule, GrowthScalingMode, GrowthSourceType } from './api/types';

export interface GrowthRewardWeight {
  skillId: string;
  xpReward: number;
}

/** Keep server parity when selecting the capped, active weighted awards. */
export function selectGrowthRewardWeights<T extends GrowthRewardWeight>(
  awards: readonly T[],
  archivedSkillIds: ReadonlySet<string> = new Set(),
): T[] {
  return awards
    .filter((award) => Number.isFinite(award.xpReward) && award.xpReward > 0 && !archivedSkillIds.has(award.skillId))
    .sort((left, right) => left.skillId.localeCompare(right.skillId))
    .slice(0, 3);
}

/**
 * Split one account XP event budget across at most three skill weights.
 * Largest-remainder rounding is stable by skill id, so offline and server
 * calculations agree even when the budget does not divide evenly.
 */
export function splitGrowthAccountXp(accountXp: number, awards: readonly GrowthRewardWeight[]): number[] {
  const budget = Math.max(0, Math.trunc(Number.isFinite(accountXp) ? accountXp : 0));
  const selected = selectGrowthRewardWeights(awards);
  if (budget <= 0 || selected.length === 0) return selected.map(() => 0);

  const totalWeight = selected.reduce((sum, award) => sum + award.xpReward, 0);
  const exact = selected.map((award) => (budget * award.xpReward) / totalWeight);
  const allocations = exact.map(Math.floor);
  let remainder = budget - allocations.reduce((sum, amount) => sum + amount, 0);
  const order = exact
    .map((amount, index) => ({ index, fraction: amount - Math.floor(amount), skillId: selected[index].skillId }))
    .sort((left, right) => right.fraction - left.fraction || left.skillId.localeCompare(right.skillId));
  for (let index = 0; index < order.length && remainder > 0; index += 1, remainder -= 1) {
    allocations[order[index].index] += 1;
  }
  return allocations;
}

export function growthSkillWeightsTotal(awards: readonly GrowthRewardWeight[]): number {
  return awards.reduce((sum, award) => sum + Math.max(0, Math.trunc(Number(award.xpReward) || 0)), 0);
}

export function growthAwardsUseSharedXp(awards: Array<{ xpReward: number }>): boolean {
  return awards.length < 2 || awards.every((award) => award.xpReward === awards[0]?.xpReward);
}

export function isPositiveGrowthRewardValue(value: string | undefined): boolean {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

export function growthRewardValueIsSelected(values: Record<string, string>, id: string): boolean {
  return isPositiveGrowthRewardValue(values[id]);
}

/**
 * Clamp an entered skill weight so the combined weights never exceed 100.
 * Empty/non-positive inputs deselect the entry.
 */
export function clampWeightValue(current: Record<string, string>, id: string, value: string): Record<string, string> {
  if (value === '') return { ...current, [id]: value };
  if (!isPositiveGrowthRewardValue(value)) {
    const next = { ...current };
    delete next[id];
    return next;
  }
  const otherTotal = Object.entries(current)
    .filter(([key, entryValue]) => key !== id && isPositiveGrowthRewardValue(entryValue))
    .reduce((sum, [, entryValue]) => sum + (Number(entryValue) || 0), 0);
  const maxAllowed = Math.max(0, 100 - otherTotal);
  return { ...current, [id]: String(Math.min(Number(value), maxAllowed)) };
}

export function buildGrowthRuleDraft({
  sourceType,
  sourceId,
  ruleId,
  coins,
  accountXp,
  scalingMode,
  maxRewardCap,
  selectedEntries,
  selectedItems,
  xp,
  itemQuantities,
}: {
  sourceType: GrowthSourceType;
  sourceId: string;
  ruleId?: string;
  coins: string;
  accountXp: string;
  scalingMode: GrowthScalingMode;
  maxRewardCap: string;
  selectedEntries: GrowthEarningRule['skillAwards'][number]['skill'][];
  selectedItems: GrowthEarningRule['itemAwards'][number]['item'][];
  xp: Record<string, string>;
  itemQuantities: Record<string, string>;
}) {
  const skillAwards = selectGrowthRewardWeights(
    selectedEntries.map((entry) => ({
      skillId: entry.id,
      xpReward: Math.max(0, Math.trunc(Number(xp[entry.id]) || 0)),
    })),
  );
  const payload = {
    sourceType,
    sourceId,
    ruleId,
    coinReward: Math.max(0, Math.trunc(Number(coins) || 0)),
    accountXp: Math.max(0, Math.trunc(Number(accountXp) || 0)),
    enabled: true,
    scalingMode,
    maxRewardCap: maxRewardCap ? Math.max(1, Number(maxRewardCap) || 0) : null,
    skillAwards,
    itemAwards: selectedItems
      .map((item) => ({
        itemId: item.id,
        quantity: Math.max(0, Math.trunc(Number(itemQuantities[item.id]) || 0)),
      }))
      .filter((award) => award.quantity > 0),
  };

  const optimistic: GrowthEarningRule = {
    id: ruleId ?? `${sourceType}:${sourceId}`,
    sourceType,
    sourceId,
    coinReward: payload.coinReward,
    accountXp: payload.accountXp,
    enabled: true,
    scalingMode,
    maxRewardCap: payload.maxRewardCap,
    version: 1,
    skillAwards: payload.skillAwards.map((award) => ({
      ...award,
      skill: selectedEntries.find((entry) => entry.id === award.skillId)!,
    })),
    itemAwards: payload.itemAwards.map((award) => ({
      ...award,
      item: selectedItems.find((item) => item.id === award.itemId)!,
    })),
  };

  return { payload, optimistic };
}

export function growthRuleComparable(
  rule?: Pick<
    GrowthEarningRule,
    'coinReward' | 'accountXp' | 'enabled' | 'scalingMode' | 'maxRewardCap' | 'skillAwards' | 'itemAwards'
  >,
) {
  return {
    coinReward: rule?.coinReward ?? 0,
    accountXp: rule?.accountXp ?? 100,
    enabled: rule?.enabled ?? true,
    scalingMode: rule?.scalingMode ?? 'FIXED',
    maxRewardCap: rule?.maxRewardCap ?? null,
    skillAwards: [...(rule?.skillAwards ?? [])]
      .map((award) => ({ skillId: award.skillId, xpReward: award.xpReward }))
      .sort((left, right) => left.skillId.localeCompare(right.skillId)),
    itemAwards: [...(rule?.itemAwards ?? [])]
      .map((award) => ({ itemId: award.itemId, quantity: award.quantity }))
      .sort((left, right) => left.itemId.localeCompare(right.itemId)),
  };
}

export function defaultGrowthWeights(count: number): number[] {
  if (count <= 1) return [100];
  if (count === 2) return [70, 30];
  return [60, 25, 15];
}
