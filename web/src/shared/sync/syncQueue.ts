import { ApiRequestError, HttpClient } from '../api/httpClient';
import { offlineSyncStore } from './offlineStore';
import { createUlid, getClientInstanceId, getDeviceId } from './syncIdentity';
import type { GrowthAwardReceipt } from '../api/types';

export interface SyncMutationOutcome {
  mutationId: string;
  growthReceipt?: GrowthAwardReceipt;
}

export interface ClientSyncMutation {
  id: string;
  kind: string;
  entityId: string;
  baseVersion?: number;
  baseValues?: Record<string, unknown>;
  fieldEditedAt?: Record<string, string>;
  payload: Record<string, unknown>;
  occurredAt: string;
  attemptCount?: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  lastErrorCode?: string;
}

export interface SyncConflict {
  mutationId: string;
  entityType: string;
  entityId: string;
  reason: string;
  serverData: unknown;
  localDraft: Record<string, unknown>;
  conflictingFields?: string[];
  kind?: string;
  occurredAt?: string;
}

export interface SyncChange {
  cursor?: number;
  entityType: string;
  entityId: string;
  deleted: boolean;
  data: unknown;
  complete?: boolean;
}

export interface SyncResponse {
  acknowledgedMutationIds: string[];
  cursor: string;
  lastSyncTime?: string;
  changes: SyncChange[];
  conflicts: SyncConflict[];
  mutationOutcomes?: SyncMutationOutcome[];
  localOnly?: boolean;
}

export type SyncPhase = 'offline' | 'pending' | 'syncing' | 'up-to-date' | 'conflict';

export interface SyncState {
  phase: SyncPhase;
  pendingCount: number;
  conflictCount: number;
}

type SyncStateListener = (state: SyncState) => void;
type SyncResponseListener = (response: SyncResponse) => void | Promise<void>;

type SyncChannelMessage =
  | { type: 'OUTBOX_CHANGED'; originClientInstanceId: string }
  | { type: 'SYNC_RESPONSE'; originClientInstanceId: string; response: SyncResponse };

const FLUSH_DELAY_MS = 1500;
const LEASE_DURATION_MS = 5000;
const IMMEDIATE_LEASE_RETRY_MS = 50;
const RECONCILE_INTERVAL_MS = 60_000;
const CHANNEL_NAME = 'itu-sync-v1';

export class SyncQueue {
  private readonly httpClient: HttpClient;
  private readonly deviceId = getDeviceId();
  private readonly clientInstanceId = getClientInstanceId();
  private readonly stateListeners = new Set<SyncStateListener>();
  private readonly responseListeners = new Set<SyncResponseListener>();
  private channel: BroadcastChannel | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;
  private readonly inFlightMutationIds = new Set<string>();
  private pendingFlushRequested = false;
  private pendingPullRequested = false;
  private pendingPullCursor: number | null = null;
  private started = false;
  private authenticated = true;
  private authSessionKey: string | null = null;
  private authGeneration = 0;
  private retryAttempt = 0;
  private state: SyncState = { phase: navigator.onLine ? 'up-to-date' : 'offline', pendingCount: 0, conflictCount: 0 };

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
  }

  public start(): void {
    if (this.started) return;
    this.started = true;
    this.channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);
    this.channel?.addEventListener('message', this.handleChannelMessage);
    this.setupLifecycleListeners();
    this.reconcileTimer = setInterval(() => {
      if (navigator.onLine && document.visibilityState === 'visible') void this.pull();
    }, RECONCILE_INTERVAL_MS);
    void (async () => {
      await this.refreshState();
      if ((await offlineSyncStore.listMutations()).length > 0) this.scheduleFlush(50);
    })();
  }

  public stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
    this.pendingPullRequested = false;
    this.pendingPullCursor = null;
    this.channel?.removeEventListener('message', this.handleChannelMessage);
    this.channel?.close();
    this.channel = null;
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('focus', this.handleFocus);
    window.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  public getIdentity() {
    return { deviceId: this.deviceId, clientInstanceId: this.clientInstanceId };
  }

  public setAuthenticated(authenticated: boolean, sessionKey?: string | null): void {
    const nextSessionKey = sessionKey === undefined ? this.authSessionKey : sessionKey;
    if (authenticated !== this.authenticated || nextSessionKey !== this.authSessionKey) {
      this.authGeneration += 1;
    }
    this.authenticated = authenticated;
    this.authSessionKey = nextSessionKey;
    if (!authenticated && this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  public getState(): SyncState {
    return this.state;
  }

  public subscribe(listener: SyncStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  public subscribeResponses(listener: SyncResponseListener): () => void {
    this.responseListeners.add(listener);
    return () => this.responseListeners.delete(listener);
  }

  public async enqueue(mutation: ClientSyncMutation, immediate = false): Promise<void> {
    const mutations = await offlineSyncStore.listMutations();
    const coalesced = coalesceMutation(
      mutations.filter((queued) => !this.inFlightMutationIds.has(queued.id)),
      mutation,
    );
    if (coalesced.replacedId) {
      await offlineSyncStore.replaceMutation(coalesced.replacedId, coalesced.mutation);
      if (isGrowthAttributeMappingUpsert(mutation)) {
        await offlineSyncStore.deleteConflict(coalesced.replacedId);
      }
    } else {
      await offlineSyncStore.putMutation(coalesced.mutation);
    }
    this.channel?.postMessage({
      type: 'OUTBOX_CHANGED',
      originClientInstanceId: this.clientInstanceId,
    } satisfies SyncChannelMessage);
    await this.refreshState();
    if (immediate) {
      if (this.isFlushing) this.pendingFlushRequested = true;
      else void this.flush(false, IMMEDIATE_LEASE_RETRY_MS);
    } else {
      this.scheduleFlush();
    }
  }

  public scheduleFlush(delayMs = FLUSH_DELAY_MS): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => void this.flush(), delayMs);
  }

  public broadcastOptimisticChange(change: SyncResponse['changes'][number]): void {
    this.channel?.postMessage({
      type: 'SYNC_RESPONSE',
      originClientInstanceId: this.clientInstanceId,
      response: {
        acknowledgedMutationIds: [],
        cursor: '',
        changes: [change],
        conflicts: [],
        localOnly: true,
      },
    } satisfies SyncChannelMessage);
  }

  public async pull(targetCursor?: string): Promise<SyncResponse | null> {
    if (!this.authenticated) {
      await this.refreshState();
      return null;
    }
    const requestedCursor = parseSyncCursor(targetCursor);
    let cursorOverride: string | undefined;
    if (requestedCursor !== null) {
      const currentCursor = parseSyncCursor(await offlineSyncStore.getCursor()) ?? 0;
      if (requestedCursor < currentCursor) cursorOverride = '0';
    }
    if (this.isFlushing) {
      this.pendingPullRequested = true;
      if (requestedCursor !== null) {
        this.pendingPullCursor = Math.max(this.pendingPullCursor ?? 0, requestedCursor);
      }
      return null;
    }
    return this.synchronize([], cursorOverride);
  }

  public async flush(force = false, leaseRetryDelayMs = LEASE_DURATION_MS): Promise<SyncResponse | null> {
    if (!this.authenticated || this.isFlushing || !navigator.onLine) {
      await this.refreshState();
      return null;
    }
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;

    const lease = force ? null : await offlineSyncStore.acquireLease(this.clientInstanceId, LEASE_DURATION_MS);
    if (!force && !lease) {
      this.scheduleFlush(leaseRetryDelayMs);
      return null;
    }
    try {
      const mutations = await offlineSyncStore.listMutations();
      const ready = force
        ? mutations
        : mutations.filter((mutation) => !mutation.nextRetryAt || new Date(mutation.nextRetryAt) <= new Date());
      if (ready.length === 0 && mutations.length > 0) {
        const nextRetryAt = Math.min(...mutations.map((mutation) => Date.parse(mutation.nextRetryAt ?? '')));
        this.scheduleFlush(Math.max(0, nextRetryAt - Date.now()));
        return null;
      }
      return this.synchronize(ready);
    } finally {
      if (lease) await offlineSyncStore.releaseLease(this.clientInstanceId, lease.token);
    }
  }

  public async listConflicts(): Promise<SyncConflict[]> {
    return offlineSyncStore.listConflicts();
  }

  public async listPendingMutations(): Promise<ClientSyncMutation[]> {
    return offlineSyncStore.listMutations();
  }

  public async retryMutation(mutationId: string, keepLocal = false): Promise<SyncResponse | null> {
    const mutation = (await offlineSyncStore.listMutations()).find((item) => item.id === mutationId);
    if (!mutation) return null;
    const retry = clearMutationFailure(mutation);
    if (keepLocal) {
      retry.id = createUlid();
      retry.occurredAt = new Date().toISOString();
      delete retry.baseVersion;
      delete retry.baseValues;
    }
    await offlineSyncStore.replaceMutation(mutationId, retry);
    return this.synchronize([retry]);
  }

  public async discardMutation(mutationId: string): Promise<void> {
    await offlineSyncStore.deleteConflict(mutationId);
    await offlineSyncStore.deleteMutations([mutationId]);
    await this.refreshState();
    this.channel?.postMessage({
      type: 'OUTBOX_CHANGED',
      originClientInstanceId: this.clientInstanceId,
    } satisfies SyncChannelMessage);
  }

  public async discardFailedMutations(): Promise<void> {
    const failedIds = (await offlineSyncStore.listMutations())
      .filter((mutation) => mutation.attemptCount || mutation.lastErrorCode)
      .map((mutation) => mutation.id);
    await offlineSyncStore.deleteMutations(failedIds);
    await Promise.all(failedIds.map((id) => offlineSyncStore.deleteConflict(id)));
    await this.refreshState();
    this.channel?.postMessage({
      type: 'OUTBOX_CHANGED',
      originClientInstanceId: this.clientInstanceId,
    } satisfies SyncChannelMessage);
  }

  public async keepServer(mutationId: string): Promise<void> {
    await offlineSyncStore.deleteConflict(mutationId);
    await offlineSyncStore.deleteMutations([mutationId]);
    await this.refreshState();
  }

  public async keepMine(mutationId: string): Promise<void> {
    const conflicts = await offlineSyncStore.listConflicts();
    const conflict = conflicts.find((item) => item.mutationId === mutationId);
    if (!conflict) return;
    await this.requeueConflict(conflict);
    await this.refreshState();
    void this.flush();
  }

  private async requeueConflict(conflict: SyncConflict): Promise<void> {
    const serverVersion =
      typeof conflict.serverData === 'object' &&
      conflict.serverData !== null &&
      typeof (conflict.serverData as { version?: unknown }).version === 'number'
        ? (conflict.serverData as { version: number }).version
        : undefined;
    const original = conflict.kind
      ? {
          id: conflict.mutationId,
          kind: conflict.kind,
          entityId: conflict.entityId,
          payload: conflict.localDraft,
          occurredAt: conflict.occurredAt ?? new Date().toISOString(),
        }
      : undefined;
    if (!original) return;
    await offlineSyncStore.replaceMutation(conflict.mutationId, {
      ...original,
      id: createUlid(),
      baseVersion: serverVersion,
      baseValues: pickConflictBaseValues(conflict),
      occurredAt: new Date().toISOString(),
    });
    await offlineSyncStore.deleteConflict(conflict.mutationId);
  }

  private async synchronize(mutations: ClientSyncMutation[], cursorOverride?: string): Promise<SyncResponse | null> {
    if (!this.authenticated || this.isFlushing || !navigator.onLine) return null;
    const authGeneration = this.authGeneration;
    this.isFlushing = true;
    mutations.forEach((mutation) => this.inFlightMutationIds.add(mutation.id));
    await this.setState({ phase: 'syncing' });
    let acknowledgedGrowthMappings: ClientSyncMutation[] = [];
    try {
      const cursor = cursorOverride ?? (await offlineSyncStore.getCursor());
      const syncResult = await this.httpClient.request<SyncResponse>('/sync', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: this.deviceId,
          clientInstanceId: this.clientInstanceId,
          cursor,
          mutations: mutations.map(toSyncMutationPayload),
        }),
      });
      if (!this.isCurrentAuthGeneration(authGeneration)) return null;
      const conflicts = syncResult.conflicts.map((conflict) => {
        const original = mutations.find((mutation) => mutation.id === conflict.mutationId);
        return {
          ...conflict,
          kind: original?.kind,
          occurredAt: original?.occurredAt,
          localDraft: original?.payload ?? conflict.localDraft,
        };
      });
      const autoRebaseConflicts = conflicts.filter(shouldAutoRebaseConflict);
      const manualConflicts = conflicts.filter((conflict) => !shouldAutoRebaseConflict(conflict));
      const queuedAfterPush = await offlineSyncStore.listMutations();
      const knownMutations = [...queuedAfterPush, ...mutations];
      acknowledgedGrowthMappings = knownMutations.filter(
        (mutation) =>
          syncResult.acknowledgedMutationIds.includes(mutation.id) && isGrowthAttributeMappingUpsert(mutation),
      );
      const supersededMappingIds = supersededGrowthMappingMutationIds(
        queuedAfterPush,
        syncResult.acknowledgedMutationIds,
        this.inFlightMutationIds,
        acknowledgedGrowthMappings,
      );
      if (!this.isCurrentAuthGeneration(authGeneration)) return null;
      await offlineSyncStore.deleteMutations([...syncResult.acknowledgedMutationIds, ...supersededMappingIds]);
      await Promise.all(supersededMappingIds.map((mutationId) => offlineSyncStore.deleteConflict(mutationId)));
      if (!this.isCurrentAuthGeneration(authGeneration)) return null;
      for (const conflict of autoRebaseConflicts) await this.requeueConflict(conflict);
      await offlineSyncStore.putConflicts(manualConflicts);
      if (autoRebaseConflicts.length > 0) this.scheduleFlush(50);
      if (!this.isCurrentAuthGeneration(authGeneration)) return null;
      const response: SyncResponse = {
        acknowledgedMutationIds: syncResult.acknowledgedMutationIds,
        cursor: syncResult.cursor,
        lastSyncTime: syncResult.lastSyncTime,
        changes: syncResult.changes,
        conflicts: manualConflicts,
        mutationOutcomes: syncResult.mutationOutcomes ?? [],
      };
      await this.emitResponse(response);
      if (!this.isCurrentAuthGeneration(authGeneration)) return null;
      if (response.cursor) await offlineSyncStore.setCursor(response.cursor);
      if (!this.isCurrentAuthGeneration(authGeneration)) return null;
      this.channel?.postMessage({
        type: 'SYNC_RESPONSE',
        originClientInstanceId: this.clientInstanceId,
        response,
      } satisfies SyncChannelMessage);
      this.retryAttempt = 0;
      return response;
    } catch (error) {
      if (!this.isCurrentAuthGeneration(authGeneration)) return null;
      if (await this.recoverReusedMutationId(error, mutations, authGeneration)) {
        this.retryAttempt = 0;
        this.pendingFlushRequested = true;
        return null;
      }
      if (!this.isCurrentAuthGeneration(authGeneration)) return null;
      const errorCode = syncErrorCode(error);
      const storedAttempt = mutations.reduce((highest, mutation) => Math.max(highest, mutation.attemptCount ?? 0), 0);
      this.retryAttempt = Math.max(this.retryAttempt + 1, storedAttempt + 1);
      const delay = calculateRetryDelay(
        this.retryAttempt,
        error instanceof ApiRequestError ? error.retryAfterMs : undefined,
      );
      const attemptedAt = new Date();
      await offlineSyncStore.markMutationsFailed(
        mutations.map((mutation) => mutation.id),
        {
          attemptCount: this.retryAttempt,
          lastAttemptAt: attemptedAt.toISOString(),
          nextRetryAt: new Date(attemptedAt.getTime() + delay).toISOString(),
          lastErrorCode: errorCode,
        },
      );
      if (shouldAutomaticallyRetryErrorCode(errorCode)) this.scheduleFlush(delay);
      return null;
    } finally {
      mutations.forEach((mutation) => this.inFlightMutationIds.delete(mutation.id));
      if (acknowledgedGrowthMappings.length) {
        await this.cleanupSupersededGrowthMappings(acknowledgedGrowthMappings);
      }
      this.isFlushing = false;
      await this.refreshState();
      const pendingFlushRequested = this.pendingFlushRequested;
      const pendingPullRequested = this.pendingPullRequested;
      const pendingPullCursor = this.pendingPullCursor;
      this.pendingFlushRequested = false;
      this.pendingPullRequested = false;
      this.pendingPullCursor = null;
      if (pendingFlushRequested) void this.flush();
      if (pendingPullRequested) void this.pull(pendingPullCursor === null ? undefined : String(pendingPullCursor));
    }
  }

  private async cleanupSupersededGrowthMappings(acknowledged: ClientSyncMutation[]): Promise<void> {
    const queued = await offlineSyncStore.listMutations();
    const supersededIds = supersededGrowthMappingMutationIds(
      queued,
      acknowledged.map((mutation) => mutation.id),
      this.inFlightMutationIds,
      acknowledged,
    );
    if (supersededIds.length === 0) return;
    await offlineSyncStore.deleteMutations(supersededIds);
    await Promise.all(supersededIds.map((mutationId) => offlineSyncStore.deleteConflict(mutationId)));
  }

  private async recoverReusedMutationId(
    error: unknown,
    mutations: ClientSyncMutation[],
    authGeneration: number,
  ): Promise<boolean> {
    const mutationId = reusedMutationId(error);
    if (!mutationId) return false;
    const mutation = mutations.find((item) => item.id === mutationId);
    if (!mutation) return false;
    if (!this.isCurrentAuthGeneration(authGeneration)) return false;

    await offlineSyncStore.replaceMutation(mutationId, {
      ...clearMutationFailure(mutation),
      id: createUlid(),
      occurredAt: new Date().toISOString(),
    });
    if (!this.isCurrentAuthGeneration(authGeneration)) return false;
    this.channel?.postMessage({
      type: 'OUTBOX_CHANGED',
      originClientInstanceId: this.clientInstanceId,
    } satisfies SyncChannelMessage);
    return true;
  }

  private readonly handleChannelMessage = (event: MessageEvent<SyncChannelMessage>) => {
    const message = event.data;
    if (!message || message.originClientInstanceId === this.clientInstanceId) return;
    if (message.type === 'OUTBOX_CHANGED') {
      void this.refreshState().then(() => this.scheduleFlush(50));
      return;
    }
    if (message.type === 'SYNC_RESPONSE') {
      void this.emitResponse(message.response);
      void this.refreshState();
    }
  };

  private async emitResponse(response: SyncResponse): Promise<void> {
    await Promise.all([...this.responseListeners].map((listener) => listener(response)));
  }

  private isCurrentAuthGeneration(generation: number): boolean {
    return this.authenticated && generation === this.authGeneration;
  }

  private async refreshState(): Promise<void> {
    const [mutations, conflicts] = await Promise.all([
      offlineSyncStore.listMutations(),
      offlineSyncStore.listConflicts(),
    ]);
    const phase: SyncPhase = !navigator.onLine
      ? 'offline'
      : conflicts.length > 0
        ? 'conflict'
        : this.isFlushing
          ? 'syncing'
          : mutations.length > 0
            ? 'pending'
            : 'up-to-date';
    await this.setState({ phase, pendingCount: mutations.length, conflictCount: conflicts.length });
  }

  private async setState(next: Partial<SyncState>): Promise<void> {
    const state = { ...this.state, ...next };
    if (
      state.phase === this.state.phase &&
      state.pendingCount === this.state.pendingCount &&
      state.conflictCount === this.state.conflictCount
    ) {
      return;
    }
    this.state = state;
    this.stateListeners.forEach((listener) => listener(state));
  }

  private setupLifecycleListeners(): void {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    window.addEventListener('focus', this.handleFocus);
    window.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private readonly handleOnline = () => void this.flush();
  private readonly handleOffline = () => void this.refreshState();
  private readonly handleFocus = () => void this.pull();
  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      void this.flush();
      return;
    }
    void this.pull();
  };
}

function toSyncMutationPayload(mutation: ClientSyncMutation) {
  const { id, kind, entityId, baseVersion, baseValues, fieldEditedAt, payload, occurredAt } = mutation;
  return { id, kind, entityId, baseVersion, baseValues, fieldEditedAt, payload, occurredAt };
}

function clearMutationFailure(mutation: ClientSyncMutation): ClientSyncMutation {
  const retry = { ...mutation };
  delete retry.attemptCount;
  delete retry.lastAttemptAt;
  delete retry.nextRetryAt;
  delete retry.lastErrorCode;
  return retry;
}

export function calculateRetryDelay(attempt: number, retryAfterMs?: number, random = Math.random): number {
  const exponential = Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1));
  const jittered = Math.round(exponential * (0.5 + random()));
  return Math.max(jittered, retryAfterMs ?? 0);
}

export function shouldAutoRebaseConflict(conflict: SyncConflict): boolean {
  return (
    conflict.kind === 'task.update' &&
    Array.isArray(conflict.conflictingFields) &&
    conflict.conflictingFields.length > 0 &&
    conflict.conflictingFields.every((field) => field === 'status')
  );
}

export function shouldAutomaticallyRetryErrorCode(errorCode: string): boolean {
  return errorCode !== 'AUTH' && errorCode !== 'CLIENT';
}

function syncErrorCode(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401 || error.status === 403) return 'AUTH';
    if (error.status === 429) return 'RATE_LIMITED';
    if (error.status >= 500) return 'SERVER';
    return 'CLIENT';
  }
  return navigator.onLine ? 'NETWORK_OR_UNKNOWN' : 'OFFLINE';
}

function reusedMutationId(error: unknown): string | null {
  if (!(error instanceof ApiRequestError) || error.code !== 'INVALID_SYNC_MUTATION') return null;
  if (error.details?.reason !== 'MUTATION_ID_REUSED') return null;
  const mutationId = error.details.mutationId;
  return typeof mutationId === 'string' && mutationId.length > 0 ? mutationId : null;
}

function parseSyncCursor(value?: string): number | null {
  if (!value) return null;
  const cursor = Number(value);
  return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : null;
}

function pickConflictBaseValues(conflict: SyncConflict): Record<string, unknown> | undefined {
  if (typeof conflict.serverData !== 'object' || conflict.serverData === null) return undefined;
  const serverData = conflict.serverData as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(conflict.localDraft).map((field) => [field, conflictServerFieldValue(serverData, field)]),
  );
}

function conflictServerFieldValue(serverData: Record<string, unknown>, field: string): unknown {
  if (field === 'tagIds' && Array.isArray(serverData.tags)) {
    return serverData.tags
      .map((assignment) => {
        if (typeof assignment !== 'object' || assignment === null) return null;
        const tag = (assignment as { tag?: unknown }).tag;
        if (typeof tag !== 'object' || tag === null) return null;
        const id = (tag as { id?: unknown }).id;
        return typeof id === 'string' ? id : null;
      })
      .filter((id): id is string => Boolean(id))
      .sort();
  }
  return serverData[field] ?? null;
}

export function coalesceMutation(
  mutations: ClientSyncMutation[],
  next: ClientSyncMutation,
): { mutation: ClientSyncMutation; replacedId?: string } {
  const entityMutations = mutations.filter(
    (mutation) =>
      mutation.entityId === next.entityId &&
      (isMutableQueuedMutation(mutation) ||
        (isGrowthAttributeMappingUpsert(mutation) && isGrowthAttributeMappingUpsert(next))),
  );
  const create = entityMutations.find((mutation) => mutation.kind.endsWith('.create'));
  let existing = create && next.kind.endsWith('.update') ? create : undefined;
  if (!existing && next.kind.endsWith('.update')) {
    for (let index = entityMutations.length - 1; index >= 0; index -= 1) {
      if (entityMutations[index].kind === next.kind) {
        existing = entityMutations[index];
        break;
      }
    }
  }
  if (!existing && isGrowthAttributeMappingUpsert(next)) {
    for (let index = entityMutations.length - 1; index >= 0; index -= 1) {
      if (isGrowthAttributeMappingUpsert(entityMutations[index])) {
        existing = entityMutations[index];
        break;
      }
    }
  }
  if (!existing && (next.kind.startsWith('preferences.') || next.kind.startsWith('preferences:'))) {
    for (let index = entityMutations.length - 1; index >= 0; index -= 1) {
      if (entityMutations[index].kind === next.kind) {
        existing = entityMutations[index];
        break;
      }
    }
  }
  if (!existing) return { mutation: next };
  if (!canCompactGymMutation(existing, next)) return { mutation: next };
  return {
    replacedId: existing.id,
    mutation: {
      ...next,
      kind: existing.kind.endsWith('.create') ? existing.kind : next.kind,
      id: existing.id,
      baseVersion: existing.baseVersion ?? next.baseVersion,
      baseValues: { ...next.baseValues, ...existing.baseValues },
      ...(existing.fieldEditedAt || next.fieldEditedAt
        ? { fieldEditedAt: { ...existing.fieldEditedAt, ...next.fieldEditedAt } }
        : {}),
      payload: { ...existing.payload, ...next.payload },
      occurredAt: existing.occurredAt,
    },
  };
}

/**
 * A set type and completion are semantic transitions, not ordinary field edits.
 * Keep those records separate so retries/restarts cannot erase the transition.
 */
function canCompactGymMutation(existing: ClientSyncMutation, next: ClientSyncMutation): boolean {
  const semanticFields = new Set(['type', 'completedAt']);
  const existingSet = existing.kind.startsWith('workout-set.');
  const nextSet = next.kind.startsWith('workout-set.');
  if (!existingSet || !nextSet) return true;
  if (existing.kind === 'workout-set.create' && next.kind === 'workout-set.update') {
    return !Object.keys(next.payload).some((field) => semanticFields.has(field));
  }
  if (existing.kind !== 'workout-set.update' || next.kind !== 'workout-set.update') return false;
  return (
    !Object.keys(existing.payload).some((field) => semanticFields.has(field)) &&
    !Object.keys(next.payload).some((field) => semanticFields.has(field))
  );
}

export function supersededGrowthMappingMutationIds(
  mutations: ClientSyncMutation[],
  acknowledgedMutationIds: string[],
  inFlightMutationIds: ReadonlySet<string> = new Set(),
  acknowledgedMutations: ClientSyncMutation[] = mutations,
) {
  const acknowledged = acknowledgedMutations.filter(
    (mutation) => acknowledgedMutationIds.includes(mutation.id) && isGrowthAttributeMappingUpsert(mutation),
  );
  if (acknowledged.length === 0) return [];
  return mutations
    .filter(
      (mutation) =>
        isGrowthAttributeMappingUpsert(mutation) &&
        !acknowledgedMutationIds.includes(mutation.id) &&
        !inFlightMutationIds.has(mutation.id) &&
        acknowledged.some(
          (acknowledgedMutation) =>
            acknowledgedMutation.entityId === mutation.entityId &&
            compareMutationOrder(acknowledgedMutation, mutation) > 0,
        ),
    )
    .map((mutation) => mutation.id);
}

function compareMutationOrder(left: ClientSyncMutation, right: ClientSyncMutation) {
  const occurredAt = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
  return occurredAt || left.id.localeCompare(right.id);
}

function isGrowthAttributeMappingUpsert(mutation: ClientSyncMutation): boolean {
  return mutation.kind === 'growthattributemapping.upsert';
}

function isMutableQueuedMutation(mutation: ClientSyncMutation): boolean {
  return (
    mutation.attemptCount === undefined &&
    mutation.lastAttemptAt === undefined &&
    mutation.nextRetryAt === undefined &&
    mutation.lastErrorCode === undefined
  );
}
