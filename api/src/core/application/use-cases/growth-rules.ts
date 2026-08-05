export interface GrowthLevelProgress {
  level: number;
  currentXp: number;
  levelStartXp: number;
  nextLevelXp: number;
  progressXp: number;
  requiredXp: number;
  baseXp: number;
}

export function growthLevelProgress(xp: number, baseXp: number = 100): GrowthLevelProgress {
  const safeBaseXp = Math.max(10, Math.min(10000, Math.trunc(baseXp)));
  const currentXp = Math.max(0, Math.trunc(xp));
  const level = Math.floor(Math.sqrt(currentXp / safeBaseXp)) + 1;
  const levelStartXp = safeBaseXp * (level - 1) ** 2;
  const nextLevelXp = safeBaseXp * level ** 2;
  return {
    level,
    currentXp,
    levelStartXp,
    nextLevelXp,
    progressXp: currentXp - levelStartXp,
    requiredXp: nextLevelXp - levelStartXp,
    baseXp: safeBaseXp,
  };
}

export interface CurvePreviewEntry {
  level: number;
  totalXpRequired: number;
  xpForLevel: number;
}

export function growthCurvePreview(
  baseXp: number = 100,
  fromLevel: number = 1,
  count: number = 10,
): CurvePreviewEntry[] {
  const safeBaseXp = Math.max(10, Math.min(10000, Math.trunc(baseXp)));
  const startL = Math.max(1, Math.trunc(fromLevel));
  const safeCount = Math.max(1, Math.min(100, Math.trunc(count)));
  const result: CurvePreviewEntry[] = [];
  for (let l = startL; l < startL + safeCount; l++) {
    const totalXpRequired = safeBaseXp * (l - 1) ** 2;
    const nextTotal = safeBaseXp * l ** 2;
    result.push({
      level: l,
      totalXpRequired,
      xpForLevel: nextTotal - totalXpRequired,
    });
  }
  return result;
}
