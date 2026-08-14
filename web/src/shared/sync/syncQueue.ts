import { ApiRequestError, HttpClient } from '../api/httpClient';
import { offlineSyncStore } from './offlineStore';
import { createUlid, getClientInstanceId, getDeviceId } from './syncIdentity';
import type { ClientSyncMutation, SyncConflict } from './sync.types';
import {
  calculateRetryDelay,
  clearMutationFailure,
  coalesceMutation,
  isGrowthAttributeMappingUpsert,
  parseSyncCursor,
  pickConflictBaseValues,
  reusedMutationId,
  shouldAutoRebaseConflict,
  shouldAutomaticallyRetryErrorCode,
  supersededGrowthMappingMutationIds,
  syncErrorCode,
  toSyncMutationPayload,
} from './syncQueuePolicy';

export type { ClientSyncMutation, SyncConflict } from './sync.types';
export {
  calculateRetryDelay,
  coalesceMutation,
  shouldAutoRebaseConflict,
  shouldAutomaticallyRetryErrorCode,
  supersededGrowthMappingMutationIds,
} from './syncQueuePolicy';

interface SyncMutationOutcome {
  mutationId: string;
  /** Feature-owned mutation data transported without shared-sync interpretation. */
  growthReceipt?: unknown;
}

interface SyncChange {
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

type SyncPhase = 'offline' | 'pending' | 'syncing' | 'up-to-date' | 'conflict';

export interface SyncState {
  phase: SyncPhase;
  pendingCount: number;
  conflictCount: number;
}

type SyncStateListener = (state: SyncState) => void;
type SyncResponseListener = (response: SyncResponse) => void | Promise<void>;

type SyncChannelMessage =
  | { type: 'OUTBOX_CHANGED'; originClientInstanceId: string; sessionKey: string }
  | { type: 'SYNC_RESPONSE'; originClientInstanceId: string; sessionKey: string; response: SyncResponse };

type SyncChannelPayload =
  | { type: 'OUTBOX_CHANGED'; originClientInstanceId: string }
  | { type: 'SYNC_RESPONSE'; originClientInstanceId: string; response: SyncResponse };

const FLUSH_DELAY_MS = 1500;
const LEASE_DURATION_MS = 5000;
const IMMEDIATE_LEASE_RETRY_MS = 50;
const RECONCILE_INTERVAL_MS = 15_000;
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
  private broadcastSessionKey: string | null = null;
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
    const lifecycleGeneration = this.authGeneration;
    void (async () => {
      await this.refreshState(lifecycleGeneration);
      if (!this.started || lifecycleGeneration !== this.authGeneration) return;
      if ((await offlineSyncStore.listMutations()).length > 0 && this.started && lifecycleGeneration === this.authGeneration) {
        this.scheduleFlush(50);
      }
    })();
  }

  public stop(): void {
    if (!this.started) return;
    this.authGeneration += 1;
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

  public setAuthenticated(
    authenticated: boolean,
    sessionKey?: string | null,
    broadcastSessionKey?: string | null,
  ): void {
    const nextSessionKey = sessionKey === undefined ? this.authSessionKey : sessionKey;
    const nextBroadcastSessionKey = broadcastSessionKey === undefined ? null : broadcastSessionKey;
    if (
      authenticated !== this.authenticated ||
      nextSessionKey !== this.authSessionKey ||
      nextBroadcastSessionKey !== this.broadcastSessionKey
    ) {
      this.authGeneration += 1;
    }
    this.authenticated = authenticated;
    this.authSessionKey = nextSessionKey;
    this.broadcastSessionKey = nextBroadcastSessionKey;
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
    this.postChannelMessage({
      type: 'OUTBOX_CHANGED',
      originClientInstanceId: this.clientInstanceId,
    });
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
    this.postChannelMessage({
      type: 'SYNC_RESPONSE',
      originClientInstanceId: this.clientInstanceId,
      response: {
        acknowledgedMutationIds: [],
        cursor: '',
        changes: [change],
        conflicts: [],
        localOnly: true,
      },
    });
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
    this.postChannelMessage({
      type: 'OUTBOX_CHANGED',
      originClientInstanceId: this.clientInstanceId,
    });
  }

  public async discardFailedMutations(): Promise<void> {
    const failedIds = (await offlineSyncStore.listMutations())
      .filter((mutation) => mutation.attemptCount || mutation.lastErrorCode)
      .map((mutation) => mutation.id);
    await offlineSyncStore.deleteMutations(failedIds);
    await Promise.all(failedIds.map((id) => offlineSyncStore.deleteConflict(id)));
    await this.refreshState();
    this.postChannelMessage({
      type: 'OUTBOX_CHANGED',
      originClientInstanceId: this.clientInstanceId,
    });
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
      this.postChannelMessage({
        type: 'SYNC_RESPONSE',
        originClientInstanceId: this.clientInstanceId,
        response,
      });
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
      if (this.isCurrentAuthGeneration(authGeneration) && acknowledgedGrowthMappings.length) {
        await this.cleanupSupersededGrowthMappings(acknowledgedGrowthMappings, authGeneration);
      }
      this.isFlushing = false;
      if (!this.isCurrentAuthGeneration(authGeneration)) {
        this.pendingFlushRequested = false;
        this.pendingPullRequested = false;
        this.pendingPullCursor = null;
        return null;
      }
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

  private async cleanupSupersededGrowthMappings(
    acknowledged: ClientSyncMutation[],
    authGeneration: number,
  ): Promise<void> {
    if (!this.isCurrentAuthGeneration(authGeneration)) return;
    const queued = await offlineSyncStore.listMutations();
    if (!this.isCurrentAuthGeneration(authGeneration)) return;
    const supersededIds = supersededGrowthMappingMutationIds(
      queued,
      acknowledged.map((mutation) => mutation.id),
      this.inFlightMutationIds,
      acknowledged,
    );
    if (supersededIds.length === 0) return;
    if (!this.isCurrentAuthGeneration(authGeneration)) return;
    await offlineSyncStore.deleteMutations(supersededIds);
    if (!this.isCurrentAuthGeneration(authGeneration)) return;
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
    this.postChannelMessage({
      type: 'OUTBOX_CHANGED',
      originClientInstanceId: this.clientInstanceId,
    });
    return true;
  }

  private readonly handleChannelMessage = (event: MessageEvent<SyncChannelMessage>) => {
    const message = event.data;
    if (!message || message.originClientInstanceId === this.clientInstanceId) return;
    if (!this.authenticated || !this.broadcastSessionKey || message.sessionKey !== this.broadcastSessionKey) return;
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
    if (!this.authenticated) return;
    await Promise.all([...this.responseListeners].map((listener) => listener(response)));
  }

  private postChannelMessage(message: SyncChannelPayload): void {
    if (!this.channel || !this.authenticated || !this.broadcastSessionKey) return;
    this.channel.postMessage({ ...message, sessionKey: this.broadcastSessionKey });
  }

  private isCurrentAuthGeneration(generation: number): boolean {
    return this.authenticated && generation === this.authGeneration;
  }

  private async refreshState(expectedGeneration = this.authGeneration): Promise<void> {
    const [mutations, conflicts] = await Promise.all([
      offlineSyncStore.listMutations(),
      offlineSyncStore.listConflicts(),
    ]);
    if (expectedGeneration !== this.authGeneration) return;
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
