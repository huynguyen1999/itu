import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import type { GrowthAwardReceipt, GrowthEarningRule, GrowthOverview, GrowthSkill } from '@/shared/api/types';
import { type SyncResponse } from '@/shared/sync/syncQueue';
import { type SyncMutationEvent } from '@/shared/sync/sync.types';
import { useSync } from '@/shared/sync/SyncProvider';
import { selectGrowthRewardWeights, splitGrowthAccountXp } from '@/shared/growthRewardMath';
import { applyOptimisticGrowthReceipt } from './growthReceiptCache';

interface GrowthSyncContextValue {
  growthReceipts: GrowthAwardReceipt[];
  dismissGrowthReceipt: () => void;
  dismissAllGrowthReceipts: () => void;
}

export interface GrowthReceiptEntry {
  receipt: GrowthAwardReceipt;
  key?: string;
  authoritative?: boolean;
}

const GrowthSyncContext = createContext<GrowthSyncContextValue | null>(null);

export function GrowthSyncProvider({ children }: { children: React.ReactNode }) {
  const sync = useSync();
  const queryClient = useQueryClient();
  const recentKeys = useRef(loadReceiptKeys());
  const optimisticKeys = useRef(new Set<string>());
  const [growthReceipts, setGrowthReceipts] = useState<GrowthAwardReceipt[]>([]);

  const appendGrowthReceipts = useCallback((entries: GrowthReceiptEntry[]) => {
    if (!entries.length) return;
    const previousSize = recentKeys.current.size;
    setGrowthReceipts((current) =>
      mergeGrowthReceiptEntries(current, entries, recentKeys.current, optimisticKeys.current),
    );
    if (recentKeys.current.size !== previousSize) persistReceiptKeys(recentKeys.current);
  }, []);

  const removeGrowthReceipts = useCallback((mutationIds: Set<string>) => {
    if (!mutationIds.size) return;
    mutationIds.forEach((mutationId) => {
      optimisticKeys.current.delete(mutationId);
      recentKeys.current.delete(mutationId);
    });
    persistReceiptKeys(recentKeys.current);
    setGrowthReceipts((current) => current.filter((receipt) => !mutationIds.has(receipt.receiptKey ?? '')));
  }, []);

  useEffect(() => {
    return sync.subscribeMutations((event) => {
      if (event.input.kind === 'task.update' && event.input.payload.status !== 'COMPLETED') {
        recentKeys.current.delete(`earned:TASK:${event.input.entityId}`);
        persistReceiptKeys(recentKeys.current);
      }
      const receipt = optimisticGrowthReceipt(event.input, event.cachedEntity, queryClient);
      if (!receipt) return;
      applyOptimisticGrowthReceipt(queryClient, receipt);
      appendGrowthReceipts([{ receipt, key: event.mutationId }]);
    });
  }, [appendGrowthReceipts, queryClient, sync]);

  useEffect(() => {
    return sync.subscribeResponses((response) => {
      const receipts = (response.mutationOutcomes ?? [])
        .filter((outcome): outcome is typeof outcome & { growthReceipt: GrowthAwardReceipt } =>
          isGrowthReceipt(outcome.growthReceipt),
        )
        .map((outcome) => ({ receipt: outcome.growthReceipt, key: outcome.mutationId, authoritative: true }));
      appendGrowthReceipts(receipts);
      removeGrowthReceipts(new Set(response.conflicts.map((conflict) => conflict.mutationId)));
      if (response.conflicts.length) {
        void queryClient.invalidateQueries({ queryKey: ['growth'], refetchType: 'active' });
      }
    });
  }, [appendGrowthReceipts, queryClient, removeGrowthReceipts, sync]);

  useEffect(() => {
    const failedMutationIds = new Set([
      ...sync.conflicts.map((conflict) => conflict.mutationId),
      ...sync.pendingMutations.filter((mutation) => mutation.lastErrorCode).map((mutation) => mutation.id),
    ]);
    removeGrowthReceipts(failedMutationIds);
    if (failedMutationIds.size) void queryClient.invalidateQueries({ queryKey: ['growth'], refetchType: 'active' });
    const failedMapping = sync.pendingMutations.find(
      (mutation) => mutation.kind === 'growthattributemapping.upsert' && mutation.lastErrorCode,
    );
    if (failedMapping) {
      void queryClient.invalidateQueries({
        queryKey: ['growth', 'attribute-mappings', failedMapping.entityId],
        exact: true,
      });
    }
  }, [queryClient, removeGrowthReceipts, sync.conflicts, sync.pendingMutations]);

  const value = useMemo(
    () => ({
      growthReceipts,
      dismissGrowthReceipt: () => setGrowthReceipts((current) => current.slice(1)),
      dismissAllGrowthReceipts: () => setGrowthReceipts([]),
    }),
    [growthReceipts],
  );

  return <GrowthSyncContext.Provider value={value}>{children}</GrowthSyncContext.Provider>;
}

export function useGrowthSync() {
  const context = useContext(GrowthSyncContext);
  if (!context) throw new Error('useGrowthSync must be used within GrowthSyncProvider');
  return context;
}

function isGrowthReceipt(value: unknown): value is GrowthAwardReceipt {
  return typeof value === 'object' && value !== null && 'sourceType' in value && 'sourceId' in value;
}

export function mergeGrowthReceiptEntries(
  current: GrowthAwardReceipt[],
  entries: GrowthReceiptEntry[],
  recentKeys: Set<string>,
  optimisticKeys: Set<string>,
) {
  const next = [...current];
  for (const { receipt, key: explicitKey, authoritative = false } of entries) {
    const key = explicitKey ?? growthReceiptKey(receipt);
    if (authoritative) {
      const existingIndex = next.findIndex((item) => item.receiptKey === key);
      if (existingIndex >= 0) next[existingIndex] = { ...receipt, receiptKey: key };
      else if (recentKeys.has(key)) continue;
      else next.push({ ...receipt, receiptKey: key });
      optimisticKeys.delete(key);
      recentKeys.add(key);
      continue;
    }
    if (optimisticKeys.has(key) || next.some((item) => item.receiptKey === key)) continue;
    optimisticKeys.add(key);
    next.push({ ...receipt, receiptKey: key });
  }
  return next;
}

function optimisticGrowthReceipt(
  input: SyncMutationEvent['input'],
  cachedEntity: Record<string, unknown> | undefined,
  queryClient: QueryClient,
): GrowthAwardReceipt | null {
  const transition = growthCompletionTransition(input, cachedEntity);
  if (!transition || transition.completedBefore === transition.completedAfter) return null;
  const { sourceType, sourceId, ruleSourceId, completedBefore, completedAfter, title } = transition;
  const rules = queryClient.getQueryData<GrowthEarningRule[]>(['growth', 'rules', sourceType]) ?? [];
  const rule = rules.find((item) => item.sourceId === ruleSourceId);
  if (!rule?.enabled) return null;
  const cachedSkills = queryClient.getQueryData<GrowthSkill[]>(['growth', 'skills']) ?? [];
  const cachedSkillById = new Map(cachedSkills.map((skill) => [skill.id, skill]));
  const archivedSkillIds = new Set(
    rule.skillAwards
      .filter((award) => (cachedSkillById.get(award.skillId) ?? award.skill).archivedAt)
      .map((award) => award.skillId),
  );
  const weightedAwards = selectGrowthRewardWeights(rule.skillAwards, archivedSkillIds);
  const allocations = splitGrowthAccountXp(rule.accountXp, weightedAwards);
  const progressAwards = weightedAwards
    .map((award, index) => optimisticProgressAward(award.skill, allocations[index] ?? 0))
    .filter((award) => award.xpGained > 0);
  const itemAwards = rule.itemAwards
    .filter((award) => award.quantity > 0)
    .map((award) => ({
      itemId: award.itemId,
      name: award.item.name,
      icon: award.item.icon,
      color: award.item.color,
      quantity: award.quantity,
      inventoryQuantityAfter: award.quantity,
    }));
  const overview = queryClient.getQueryData<GrowthOverview>(['growth', 'overview']);
  const accountAmount = Math.max(0, Math.trunc(rule.accountXp || 0));
  const accountBeforeXp = overview?.account?.currentXp ?? 0;
  const accountAfterXp = accountBeforeXp + accountAmount;
  const accountAward =
    accountAmount > 0 ? optimisticAccountAward(accountBeforeXp, accountAfterXp, overview?.account?.baseXp ?? 100) : null;
  if (!progressAwards.length && !accountAward && rule.coinReward <= 0 && !itemAwards.length) return null;
  return {
    sourceType,
    sourceId,
    title,
    reverted: completedBefore && !completedAfter,
    accountAward,
    progressAwards,
    coinAward: rule.coinReward > 0 ? { amount: rule.coinReward, balanceAfter: rule.coinReward } : null,
    itemAwards,
  };
}

function optimisticProgressAward(skill: GrowthSkill, xpGained: number): GrowthAwardReceipt['progressAwards'][number] {
  const beforeXp = skill.currentXp ?? 0;
  const afterXp = beforeXp + xpGained;
  return {
    progressId: skill.id,
    name: skill.name,
    kind: skill.kind,
    icon: skill.icon,
    color: skill.color,
    xpGained,
    beforeXp,
    afterXp,
    beforeLevel: skill.level,
    afterLevel: growthLevelProgress(afterXp, skill.baseXp ?? 100).level,
    nextLevelXp: growthLevelProgress(afterXp, skill.baseXp ?? 100).nextLevelXp,
  };
}

function optimisticAccountAward(beforeXp: number, afterXp: number, baseXp: number): NonNullable<GrowthAwardReceipt['accountAward']> {
  const before = growthLevelProgress(beforeXp, baseXp);
  const after = growthLevelProgress(afterXp, baseXp);
  return { amount: Math.max(0, afterXp - beforeXp), beforeXp, afterXp, beforeLevel: before.level, afterLevel: after.level, nextLevelXp: after.nextLevelXp };
}

function growthLevelProgress(xp: number, baseXp: number) {
  const safeBaseXp = Math.max(10, Math.min(10_000, Math.trunc(baseXp || 100)));
  const currentXp = Math.max(0, Math.trunc(xp));
  const level = Math.floor(Math.sqrt(currentXp / safeBaseXp)) + 1;
  return { level, nextLevelXp: safeBaseXp * level ** 2 };
}

export function growthCompletionTransition(
  input: SyncMutationEvent['input'],
  cachedEntity: Record<string, unknown> | undefined,
) {
  if (input.kind === 'task.update' && input.payload.status !== undefined) {
    return {
      sourceType: 'TASK' as const,
      sourceId: input.entityId,
      ruleSourceId: input.entityId,
      completedBefore: cachedEntity?.status === 'COMPLETED',
      completedAfter: input.payload.status === 'COMPLETED',
      title: typeof cachedEntity?.title === 'string' ? cachedEntity.title : 'Completed task',
    };
  }
  if (input.kind === 'habitoccurrence.checkin') {
    const habit = recordValue(cachedEntity?.habit);
    const targetValue = numberValue(habit?.targetValue);
    const inputValue = numberValue(input.payload.value);
    if (!habit || targetValue === null || inputValue === null) return null;
    const currentValue = (Array.isArray(cachedEntity?.progressLogs) ? cachedEntity.progressLogs : []).reduce(
      (sum, log) => sum + (numberValue(recordValue(log)?.value) ?? 0),
      0,
    );
    const totalValue = currentValue + inputValue;
    const targetReached = habit.direction === 'LIMIT' ? totalValue <= targetValue : totalValue >= targetValue;
    const requiredChecklistIncomplete = (Array.isArray(cachedEntity?.checklistItems) ? cachedEntity.checklistItems : []).some((item) => {
      const checklistItem = recordValue(item);
      return checklistItem?.required === true && !checklistItem.completedAt;
    });
    return {
      sourceType: 'HABIT' as const,
      sourceId: input.entityId,
      ruleSourceId: typeof habit.id === 'string' ? habit.id : input.entityId,
      completedBefore: cachedEntity?.status === 'COMPLETED',
      completedAfter: targetReached && !requiredChecklistIncomplete,
      title: typeof habit.name === 'string' ? habit.name : 'Completed habit',
    };
  }
  if (input.kind === 'habitoccurrence.action' && input.payload.action !== undefined) {
    const habit = recordValue(cachedEntity?.habit);
    if (!habit || cachedEntity?.status !== 'COMPLETED') return null;
    return {
      sourceType: 'HABIT' as const,
      sourceId: input.entityId,
      ruleSourceId: typeof habit.id === 'string' ? habit.id : input.entityId,
      completedBefore: true,
      completedAfter: false,
      title: typeof habit.name === 'string' ? habit.name : 'Completed habit',
    };
  }
  return null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function growthReceiptKey(receipt: GrowthAwardReceipt): string {
  return `${receipt.reverted ? 'reverted' : 'earned'}:${receipt.sourceType}:${receipt.sourceId}`;
}

const RECEIPT_KEYS_STORAGE = 'itu.growth.receipt-keys';

function loadReceiptKeys() {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const raw = window.localStorage.getItem(RECEIPT_KEYS_STORAGE);
    const values = raw ? JSON.parse(raw) : [];
    return new Set<string>(Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

function persistReceiptKeys(keys: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECEIPT_KEYS_STORAGE, JSON.stringify(Array.from(keys).slice(-200)));
  } catch {
    // Storage is optional; in-memory dedupe still prevents same-lifecycle duplicates.
  }
}
