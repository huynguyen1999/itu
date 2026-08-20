import { GrowthScalingMode, GrowthSourceType } from '@core/domain/enums';

export interface AwardScalingContext {
  reviewedCount?: number;
  durationMinutes?: number;
}

const REVIEW_ACCOUNT_XP_PER_PAIR = 1;
const REVIEW_ACCOUNT_XP_CAP = 20;
const FOCUS_ACCOUNT_XP_PER_FIVE_MINUTES = 1;
const FOCUS_ACCOUNT_XP_CAP = 15;

export function scaledSkillXp(
  xpReward: number,
  scalingMode: GrowthScalingMode,
  maxRewardCap: number | null,
  sourceType: GrowthSourceType,
  scalingContext?: AwardScalingContext,
): number {
  if (!Number.isFinite(xpReward) || xpReward <= 0) return 0;
  if (scalingMode !== GrowthScalingMode.LINEAR || sourceType !== GrowthSourceType.REVIEW_DECK) return xpReward;
  const count = scalingContext?.reviewedCount ?? 1;
  const scaled = xpReward * count;
  return maxRewardCap != null && maxRewardCap > 0 ? Math.min(scaled, maxRewardCap) : scaled;
}

/** Account XP is a bounded source budget for Study and Focus activity. */
export function scaledAccountXp(
  xpReward: number,
  scalingMode: GrowthScalingMode,
  maxRewardCap: number | null,
  sourceType: GrowthSourceType,
  scalingContext?: AwardScalingContext,
): number {
  if (!Number.isFinite(xpReward) || xpReward <= 0) return 0;
  if (sourceType === GrowthSourceType.REVIEW_DECK) {
    const reviewedCount = Math.max(0, Math.trunc(scalingContext?.reviewedCount ?? 0));
    return Math.min(REVIEW_ACCOUNT_XP_CAP, Math.floor(reviewedCount / 2) * REVIEW_ACCOUNT_XP_PER_PAIR);
  }
  if (sourceType === GrowthSourceType.FOCUS_PRESET) {
    const durationMinutes = Math.max(0, Math.trunc(scalingContext?.durationMinutes ?? 0));
    return Math.min(FOCUS_ACCOUNT_XP_CAP, Math.floor(durationMinutes / 5) * FOCUS_ACCOUNT_XP_PER_FIVE_MINUTES);
  }
  return scaledSkillXp(xpReward, scalingMode, maxRewardCap, sourceType, scalingContext);
}

/** Allocate a fixed budget using stable largest-remainder rounding. */
export function allocateSkillBudget(
  budget: number,
  awards: Array<{ skillId: string; xpAmount: number }>,
): number[] {
  if (budget <= 0 || awards.length === 0) return awards.map(() => 0);
  const totalWeight = awards.reduce((sum, award) => sum + award.xpAmount, 0);
  const exact = awards.map((award) => (budget * award.xpAmount) / totalWeight);
  const allocations = exact.map(Math.floor);
  let remainder = budget - allocations.reduce((sum, amount) => sum + amount, 0);
  const order = exact
    .map((amount, index) => ({ index, fraction: amount - Math.floor(amount), skillId: awards[index].skillId }))
    .sort((a, b) => b.fraction - a.fraction || a.skillId.localeCompare(b.skillId));
  for (let index = 0; index < order.length && remainder > 0; index += 1, remainder -= 1) {
    allocations[order[index].index] += 1;
  }
  return allocations;
}

export function allocateWeightedAmount<T extends { id: string; weight: number }>(amount: number, mappings: T[]): number[] {
  if (amount <= 0 || mappings.length === 0) return mappings.map(() => 0);
  const totalWeight = mappings.reduce((sum, mapping) => sum + mapping.weight, 0);
  if (totalWeight <= 0) return mappings.map(() => 0);
  const exact = mappings.map((mapping) => (amount * mapping.weight) / totalWeight);
  const allocations = exact.map(Math.floor);
  let remainder = amount - allocations.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value), id: mappings[index].id }))
    .sort((a, b) => b.fraction - a.fraction || a.id.localeCompare(b.id));
  for (let index = 0; index < order.length && remainder > 0; index += 1, remainder -= 1) {
    allocations[order[index].index] += 1;
  }
  return allocations;
}

export function lifecycleOrdinal(entryKey?: string | null): number {
  const match = entryKey?.match(/:lc(\d+):/);
  return match ? Number(match[1]) : 0;
}
