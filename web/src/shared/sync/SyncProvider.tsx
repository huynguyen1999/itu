import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { dehydrate, hydrate, type QueryClient, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { OfflineMutationInput } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { offlineSyncStore } from './offlineStore';
import {
  applyOptimisticGrowthReceipt,
  applySyncChanges,
  invalidateSyncChanges,
  shouldDehydrateOfflineQuery,
} from './syncCache';
import { SyncQueue, type ClientSyncMutation, type SyncConflict, type SyncState } from './syncQueue';
import { SyncWebSocketClient, type SyncInvalidationMessage } from './syncWebSocketClient';
import { createUlid } from './syncIdentity';
import type { GrowthAwardReceipt, GrowthEarningRule, GrowthOverview, GrowthSkill } from '../api/types';
import { selectGrowthRewardWeights, splitGrowthAccountXp } from '../growthRewardMath';

interface SyncContextValue {
  syncQueue: SyncQueue;
  state: SyncState;
  conflicts: SyncConflict[];
  pendingMutations: ClientSyncMutation[];
  flush: () => Promise<unknown>;
  keepServer: (mutationId: string) => Promise<void>;
  keepMine: (mutationId: string) => Promise<void>;
  retryPending: (mutationId: string) => Promise<unknown>;
  keepLocalPending: (mutationId: string) => Promise<unknown>;
  discardPending: (mutationId: string) => Promise<void>;
  discardAllFailed: () => Promise<void>;
  growthReceipts: GrowthAwardReceipt[];
  dismissGrowthReceipt: () => void;
  dismissAllGrowthReceipts: () => void;
}

export interface SyncSnapshot {
  phase: SyncState['phase'];
  pendingCount: number;
  conflictCount: number;
  conflicts: SyncConflict[];
  pendingMutations: ClientSyncMutation[];
  growthReceipts: GrowthAwardReceipt[];
}

type SyncSnapshotListener = (snapshot: SyncSnapshot) => void;

const SyncContext = createContext<SyncContextValue | null>(null);

export interface GrowthReceiptEntry {
  receipt: GrowthAwardReceipt;
  key?: string;
  authoritative?: boolean;
}

/** Owns authenticated sync lifecycle, cache projection, and outbox state. */
export class Sync {
  public readonly queue: SyncQueue;
  private readonly queryClient: QueryClient;
  private readonly wsClient: SyncWebSocketClient;
  private readonly listeners = new Set<SyncSnapshotListener>();
  private readonly recentGrowthReceiptKeys = loadReceiptKeys();
  private readonly optimisticGrowthReceiptKeys = new Set<string>();
  private snapshot: SyncSnapshot;
  private started = false;
  private authenticated = false;
  private unsubscribeToken: (() => void) | null = null;
  private unsubscribeQueueState: (() => void) | null = null;
  private unsubscribeQueueResponses: (() => void) | null = null;
  private unsubscribeWebSocket: (() => void) | null = null;
  private unsubscribeWebSocketConnected: (() => void) | null = null;

  constructor(queryClient: QueryClient) {
    this.queryClient = queryClient;
    this.queue = new SyncQueue(api);
    this.wsClient = new SyncWebSocketClient();
    this.snapshot = {
      ...this.queue.getState(),
      conflicts: [],
      pendingMutations: [],
      growthReceipts: [],
    };
  }

  public start(authenticated: boolean): void {
    const wasAuthenticated = this.authenticated;
    this.authenticated = authenticated;
    this.queue.setAuthenticated(authenticated, api.getToken());
    if (!this.started) {
      this.started = true;
      this.queue.start();
      this.unsubscribeQueueState = this.queue.subscribe((state) => {
        void this.refreshSnapshot(state);
      });
      this.unsubscribeQueueResponses = this.queue.subscribeResponses((response) => this.handleResponse(response));
      this.unsubscribeWebSocket = this.wsClient.subscribe((message) => handleSyncInvalidation(this.queue, message));
      this.unsubscribeWebSocketConnected = this.wsClient.subscribeConnected(() => {
        void this.queue.pull();
      });
      this.unsubscribeToken = api.subscribeToken((token) => {
        this.queue.setAuthenticated(this.authenticated, token);
        this.connectWithToken(token);
      });
      api.setOfflineMutationHandler(this.submit);
    }
    if (authenticated && !wasAuthenticated) this.queue.scheduleFlush(50);
    this.connectWithToken(api.getToken());
  }

  public stop(): void {
    if (!this.started) return;
    this.started = false;
    this.authenticated = false;
    this.unsubscribeToken?.();
    this.unsubscribeToken = null;
    this.unsubscribeQueueState?.();
    this.unsubscribeQueueState = null;
    this.unsubscribeQueueResponses?.();
    this.unsubscribeQueueResponses = null;
    this.unsubscribeWebSocket?.();
    this.unsubscribeWebSocket = null;
    this.unsubscribeWebSocketConnected?.();
    this.unsubscribeWebSocketConnected = null;
    api.setOfflineMutationHandler(null);
    this.queue.setAuthenticated(false, null);
    this.wsClient.disconnect();
    this.queue.stop();
  }

  public getSnapshot(): SyncSnapshot {
    return this.snapshot;
  }

  public subscribe(listener: SyncSnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  public submit = async <T,>(input: OfflineMutationInput<T>): Promise<T> => {
    const entityType = input.kind.startsWith('ai.') ? 'aijob' : input.kind.split('.')[0];
    const cachedEntity = findCachedEntity(this.queryClient, input.entityId);
    const baseVersion =
      input.baseVersion ??
      (cachedEntity && typeof cachedEntity.version === 'number' ? cachedEntity.version : undefined);
    const baseValues = input.baseValues ?? pickBaseValues(cachedEntity, input.payload);
    const mutationId = createUlid();
    const localGrowthReceipt = optimisticGrowthReceipt(input, cachedEntity, this.queryClient);
    if (input.kind === 'task.update' && input.payload.status !== undefined && input.payload.status !== 'COMPLETED') {
      this.recentGrowthReceiptKeys.delete(`earned:TASK:${input.entityId}`);
      persistReceiptKeys(this.recentGrowthReceiptKeys);
    }
    applySyncChanges(this.queryClient, {
      acknowledgedMutationIds: [],
      cursor: '',
      conflicts: [],
      changes: [
        {
          entityType,
          entityId: input.entityId,
          deleted: input.kind.endsWith('.delete'),
          data: input.optimistic,
        },
      ],
    });
    this.queue.broadcastOptimisticChange({
      entityType,
      entityId: input.entityId,
      deleted: input.kind.endsWith('.delete'),
      data: input.optimistic,
    });
    if (localGrowthReceipt) applyOptimisticGrowthReceipt(this.queryClient, localGrowthReceipt);
    this.appendGrowthReceipts(localGrowthReceipt ? [{ receipt: localGrowthReceipt, key: mutationId }] : []);
    await this.queue.enqueue(
      {
        id: mutationId,
        kind: input.kind,
        entityId: input.entityId,
        baseVersion,
        baseValues,
        payload: input.payload,
        occurredAt: new Date().toISOString(),
      },
      input.immediate,
    );
    return input.optimistic;
  };

  public flush(): Promise<unknown> {
    return this.queue.flush(true);
  }

  public pull(cursor?: string): Promise<unknown> {
    return this.queue.pull(cursor);
  }

  public keepServer(mutationId: string): Promise<void> {
    return this.queue.keepServer(mutationId);
  }

  public keepMine(mutationId: string): Promise<void> {
    return this.queue.keepMine(mutationId);
  }

  public retryPending(mutationId: string): Promise<unknown> {
    return this.queue.retryMutation(mutationId);
  }

  public keepLocalPending(mutationId: string): Promise<unknown> {
    return this.queue.retryMutation(mutationId, true);
  }

  public async discardPending(mutationId: string): Promise<void> {
    await this.queue.discardMutation(mutationId);
    await this.queryClient.invalidateQueries();
  }

  public async discardAllFailed(): Promise<void> {
    await this.queue.discardFailedMutations();
    await this.queryClient.invalidateQueries();
  }

  public dismissGrowthReceipt(): void {
    this.updateSnapshot({ growthReceipts: this.snapshot.growthReceipts.slice(1) });
  }

  public dismissAllGrowthReceipts(): void {
    this.updateSnapshot({ growthReceipts: [] });
  }

  private connectWithToken = (token: string | null): void => {
    const { deviceId, clientInstanceId } = this.queue.getIdentity();
    if (!token || !this.authenticated) {
      this.wsClient.disconnect();
      return;
    }
    void offlineSyncStore
      .getCursor()
      .then((cursor) => api.registerSyncDevice({ deviceId, lastKnownSyncCursor: cursor }))
      .then(() => {
        if (this.started && this.authenticated && api.getToken() === token) {
          this.wsClient.connect(token, deviceId, clientInstanceId);
        }
      })
      .catch(() => undefined);
  };

  private readonly handleResponse = async (response: import('./syncQueue').SyncResponse): Promise<void> => {
    if (response.localOnly) {
      applySyncChanges(this.queryClient, response);
      return;
    }
    const receipts = (response.mutationOutcomes ?? [])
      .filter((outcome): outcome is typeof outcome & { growthReceipt: GrowthAwardReceipt } =>
        Boolean(outcome.growthReceipt),
      )
      .map((outcome) => ({ receipt: outcome.growthReceipt, key: outcome.mutationId, authoritative: true }));
    this.appendGrowthReceipts(receipts);
    this.removeGrowthReceipts(new Set(response.conflicts.map((conflict) => conflict.mutationId)));
    if (response.conflicts.length)
      await this.queryClient.invalidateQueries({ queryKey: ['growth'], refetchType: 'active' });
    await invalidateSyncChanges(this.queryClient, response);
  };

  private appendGrowthReceipts(entries: GrowthReceiptEntry[]): void {
    if (!entries.length) return;
    const recentCount = this.recentGrowthReceiptKeys.size;
    const growthReceipts = mergeGrowthReceiptEntries(
      this.snapshot.growthReceipts,
      entries,
      this.recentGrowthReceiptKeys,
      this.optimisticGrowthReceiptKeys,
    );
    if (this.recentGrowthReceiptKeys.size !== recentCount) persistReceiptKeys(this.recentGrowthReceiptKeys);
    this.updateSnapshot({ growthReceipts });
  }

  private removeGrowthReceipts(mutationIds: Set<string>): void {
    if (!mutationIds.size) return;
    for (const mutationId of mutationIds) {
      this.optimisticGrowthReceiptKeys.delete(mutationId);
      this.recentGrowthReceiptKeys.delete(mutationId);
    }
    persistReceiptKeys(this.recentGrowthReceiptKeys);
    this.updateSnapshot({
      growthReceipts: this.snapshot.growthReceipts.filter((receipt) => !mutationIds.has(receipt.receiptKey ?? '')),
    });
  }

  private async refreshSnapshot(state = this.queue.getState()): Promise<void> {
    const [conflicts, pendingMutations] = await Promise.all([
      this.queue.listConflicts(),
      this.queue.listPendingMutations(),
    ]);
    this.removeGrowthReceipts(new Set(conflicts.map((conflict) => conflict.mutationId)));
    const failedMutationIds = new Set(
      pendingMutations.filter((mutation) => Boolean(mutation.lastErrorCode)).map((mutation) => mutation.id),
    );
    this.removeGrowthReceipts(failedMutationIds);
    if (failedMutationIds.size) {
      await this.queryClient.invalidateQueries({ queryKey: ['growth'], refetchType: 'active' });
    }
    for (const mutation of pendingMutations) {
      if (mutation.kind === 'growthattributemapping.upsert' && mutation.lastErrorCode) {
        await this.queryClient.invalidateQueries({
          queryKey: ['growth', 'attribute-mappings', mutation.entityId],
          exact: true,
        });
      }
    }
    this.updateSnapshot({ ...state, conflicts, pendingMutations });
  }

  private updateSnapshot(next: Partial<SyncSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}

/** Merge optimistic and authoritative receipts without double-rendering a lifecycle. */
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

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const sync = useMemo(() => new Sync(queryClient), [queryClient]);
  const [snapshot, setSnapshot] = useState(sync.getSnapshot());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let persistTimer: ReturnType<typeof setTimeout> | null = null;
    void offlineSyncStore
      .loadCache()
      .then((cache) => {
        if (cache) hydrate(queryClient, cache);
      })
      .finally(() => setHydrated(true));
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        void offlineSyncStore.saveCache(dehydrate(queryClient, { shouldDehydrateQuery: shouldDehydrateOfflineQuery }));
      }, 250);
    });
    return () => {
      unsubscribe();
      if (persistTimer) clearTimeout(persistTimer);
    };
  }, [queryClient]);

  useEffect(() => {
    sync.start(auth.isAuthenticated);
  }, [auth.isAuthenticated, sync]);

  useEffect(() => {
    const unsubscribe = sync.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      sync.stop();
    };
  }, [sync]);

  const value = useMemo(
    () => ({
      syncQueue: sync.queue,
      state: {
        phase: snapshot.phase,
        pendingCount: snapshot.pendingCount,
        conflictCount: snapshot.conflictCount,
      },
      conflicts: snapshot.conflicts,
      pendingMutations: snapshot.pendingMutations,
      flush: () => sync.flush(),
      keepServer: (mutationId: string) => sync.keepServer(mutationId),
      keepMine: (mutationId: string) => sync.keepMine(mutationId),
      retryPending: (mutationId: string) => sync.retryPending(mutationId),
      keepLocalPending: (mutationId: string) => sync.keepLocalPending(mutationId),
      discardPending: (mutationId: string) => sync.discardPending(mutationId),
      discardAllFailed: () => sync.discardAllFailed(),
      growthReceipts: snapshot.growthReceipts,
      dismissGrowthReceipt: () => sync.dismissGrowthReceipt(),
      dismissAllGrowthReceipts: () => sync.dismissAllGrowthReceipts(),
    }),
    [snapshot, sync],
  );

  if (!hydrated) return null;
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSync must be used within SyncProvider');
  return context;
}

export function handleSyncInvalidation(syncQueue: Pick<SyncQueue, 'pull'>, message: SyncInvalidationMessage): void {
  void syncQueue.pull(message.cursor);
}

function findCachedEntity(
  queryClient: ReturnType<typeof useQueryClient>,
  entityId: string,
): Record<string, unknown> | undefined {
  for (const [, data] of queryClient.getQueriesData({})) {
    const entity = findEntity(data, entityId);
    if (entity) return entity;
  }
  return undefined;
}

function findRecord(
  value: unknown,
  predicate: (record: Record<string, unknown>) => boolean,
): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const record = findRecord(item, predicate);
      if (record) return record;
    }
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (predicate(record)) return record;
  for (const nested of Object.values(record)) {
    const match = findRecord(nested, predicate);
    if (match) return match;
  }
  return undefined;
}

function findEntity(value: unknown, entityId: string): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const entity = findEntity(item, entityId);
      if (entity) return entity;
    }
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record.id === entityId) return record;
  for (const nested of Object.values(record)) {
    const entity = findEntity(nested, entityId);
    if (entity) return entity;
  }
  return undefined;
}

function pickBaseValues(
  entity: Record<string, unknown> | undefined,
  payload: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!entity || Object.keys(payload).length === 0) return undefined;
  return Object.fromEntries(Object.keys(payload).map((field) => [field, comparableFieldValue(entity, field)]));
}

function comparableFieldValue(entity: Record<string, unknown>, field: string): unknown {
  if (field === 'tagIds' && Array.isArray(entity.tags)) {
    return entity.tags
      .map((tag) => {
        if (typeof tag !== 'object' || tag === null) return null;
        const record = tag as Record<string, unknown>;
        if (typeof record.id === 'string') return record.id;
        if (typeof record.tag === 'object' && record.tag !== null) {
          const nested = record.tag as Record<string, unknown>;
          return typeof nested.id === 'string' ? nested.id : null;
        }
        return null;
      })
      .filter((id): id is string => Boolean(id))
      .sort();
  }
  return entity[field] ?? null;
}

function optimisticGrowthReceipt(
  input: OfflineMutationInput<unknown>,
  cachedEntity: Record<string, unknown> | undefined,
  queryClient: QueryClient,
): GrowthAwardReceipt | null {
  const transition = growthCompletionTransition(input, cachedEntity);
  if (!transition) return null;
  const { sourceType, sourceId, ruleSourceId, completedBefore, completedAfter, title } = transition;
  if (completedBefore === completedAfter) return null;

  const rules = queryClient.getQueryData<GrowthEarningRule[]>(['growth', 'rules', sourceType]) ?? [];
  const rule = rules.find((item) => item.sourceId === ruleSourceId);
  if (!rule?.enabled) return null;

  // The server canonicalizes weighted awards by stable skill id before
  // allocating the fixed account budget. Mirror that order offline so each
  // skill receives the same amount regardless of editor selection order.
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
  const account = overview?.account;
  const accountBeforeXp = account?.currentXp ?? 0;
  const accountAfterXp = accountBeforeXp + accountAmount;
  const accountAward =
    accountAmount > 0 ? optimisticAccountAward(accountBeforeXp, accountAfterXp, account?.baseXp ?? 100) : null;
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
  const nextLevelXp = Math.max(1, skill.nextLevelXp ?? skill.requiredXp ?? xpGained);
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

function optimisticAccountAward(
  beforeXp: number,
  afterXp: number,
  baseXp: number,
): NonNullable<GrowthAwardReceipt['accountAward']> {
  const before = growthLevelProgress(beforeXp, baseXp);
  const after = growthLevelProgress(afterXp, baseXp);
  return {
    amount: Math.max(0, afterXp - beforeXp),
    beforeXp,
    afterXp,
    beforeLevel: before.level,
    afterLevel: after.level,
    nextLevelXp: after.nextLevelXp,
  };
}

function growthLevelProgress(xp: number, baseXp: number) {
  const safeBaseXp = Math.max(10, Math.min(10_000, Math.trunc(baseXp || 100)));
  const currentXp = Math.max(0, Math.trunc(xp));
  const level = Math.floor(Math.sqrt(currentXp / safeBaseXp)) + 1;
  const levelStartXp = safeBaseXp * (level - 1) ** 2;
  const nextLevelXp = safeBaseXp * level ** 2;
  return { level, nextLevelXp };
}

export function growthCompletionTransition(
  input: OfflineMutationInput<unknown>,
  cachedEntity: Record<string, unknown> | undefined,
): {
  sourceType: 'TASK' | 'HABIT';
  sourceId: string;
  ruleSourceId: string;
  completedBefore: boolean;
  completedAfter: boolean;
  title: string;
} | null {
  if (input.kind === 'task.update' && input.payload.status !== undefined) {
    return {
      sourceType: 'TASK',
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
    const requiredChecklistIncomplete = (
      Array.isArray(cachedEntity?.checklistItems) ? cachedEntity.checklistItems : []
    ).some((item) => {
      const checklistItem = recordValue(item);
      return checklistItem?.required === true && !checklistItem.completedAt;
    });
    return {
      sourceType: 'HABIT',
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
      sourceType: 'HABIT',
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
    return new Set<string>(
      Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : [],
    );
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
