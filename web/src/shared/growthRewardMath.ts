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
