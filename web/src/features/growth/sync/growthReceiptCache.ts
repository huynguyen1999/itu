import type { QueryClient } from '@tanstack/react-query';
import type { GrowthAwardReceipt } from '@/shared/api/types';

export function applyOptimisticGrowthReceipt(queryClient: QueryClient, receipt: GrowthAwardReceipt): void {
  const accountXpDelta = receipt.accountAward
    ? receipt.reverted
      ? -receipt.accountAward.amount
      : receipt.accountAward.amount
    : 0;
  const coinDelta = receipt.coinAward ? (receipt.reverted ? -receipt.coinAward.amount : receipt.coinAward.amount) : 0;

  queryClient.setQueriesData({ queryKey: ['growth'] }, (current) => {
    const updated = updateGrowthProgress(current, receipt);
    if (!isRecord(updated) || !isRecord(updated.account) || (!receipt.accountAward && !receipt.coinAward))
      return updated;
    return {
      ...updated,
      account: {
        ...growthLevelProgress(
          numeric(updated.account.currentXp) + accountXpDelta,
          numeric(updated.account.baseXp) || 100,
        ),
        coinBalance: Math.max(0, numeric(updated.account.coinBalance) + coinDelta),
      },
    };
  });
}

function updateGrowthProgress(current: unknown, receipt: GrowthAwardReceipt): unknown {
  if (Array.isArray(current)) return current.map((value) => updateGrowthProgress(value, receipt));
  if (!isRecord(current)) return current;

  const award = receipt.progressAwards.find((item) => item.progressId === current.id);
  if (award && typeof current.currentXp === 'number') {
    const delta = receipt.reverted ? -award.xpGained : award.xpGained;
    return {
      ...current,
      ...growthLevelProgress(current.currentXp + delta, numeric(current.baseXp) || 100),
    };
  }

  let changed = false;
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(current)) {
    const updated = updateGrowthProgress(value, receipt);
    if (updated !== value) {
      next[key] = updated;
      changed = true;
    }
  }
  return changed ? next : current;
}

function growthLevelProgress(xp: number, baseXp: number) {
  const safeBaseXp = Math.max(10, Math.min(10_000, Math.trunc(baseXp)));
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

function numeric(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
