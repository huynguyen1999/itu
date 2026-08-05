export interface GrowthTaskRewardAwardDraft {
  skillId: string;
  xpReward: number;
}

export function canonicalizeGrowthTaskRewardAwards(
  awards: GrowthTaskRewardAwardDraft[],
  selectableSkillIds: ReadonlySet<string>,
) {
  return awards
    .filter((award) => selectableSkillIds.has(award.skillId) && Number.isFinite(award.xpReward) && award.xpReward > 0)
    .sort((left, right) => left.skillId.localeCompare(right.skillId))
    .slice(0, 3)
    .map((award) => ({ skillId: award.skillId, xpReward: Math.max(0, Math.trunc(award.xpReward)) }))
    .filter((award) => award.xpReward > 0);
}
