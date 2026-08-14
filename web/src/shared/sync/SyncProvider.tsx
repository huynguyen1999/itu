import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { dehydrate, hydrate, type QueryClient, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { OfflineMutationInput } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { offlineSyncStore } from './offlineStore';
import { applySyncChanges, invalidateSyncChanges, shouldDehydrateOfflineQuery } from './syncCache';
import { SyncQueue, type ClientSyncMutation, type SyncConflict, type SyncResponse, type SyncState } from './syncQueue';
import { SyncWebSocketClient, type SyncInvalidationMessage } from './syncWebSocketClient';
import { createUlid } from './syncIdentity';
import type { SyncMutationEvent } from './sync.types';

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
  subscribeMutations: (listener: (event: SyncMutationEvent) => void) => () => void;
  subscribeResponses: (listener: (response: SyncResponse) => void) => () => void;
}

export interface SyncSnapshot {
  phase: SyncState['phase'];
  pendingCount: number;
  conflictCount: number;
  conflicts: SyncConflict[];
  pendingMutations: ClientSyncMutation[];
}

type SyncSnapshotListener = (snapshot: SyncSnapshot) => void;
type SyncMutationListener = (event: SyncMutationEvent) => void;
type SyncResponseListener = (response: SyncResponse) => void;

const SyncContext = createContext<SyncContextValue | null>(null);

/** Owns authenticated sync lifecycle, cache projection, and outbox state. */
export class Sync {
  public readonly queue: SyncQueue;
  private readonly queryClient: QueryClient;
  private readonly wsClient: SyncWebSocketClient;
  private readonly listeners = new Set<SyncSnapshotListener>();
  private readonly mutationListeners = new Set<SyncMutationListener>();
  private readonly responseListeners = new Set<SyncResponseListener>();
  private snapshot: SyncSnapshot;
  private started = false;
  private authenticated = false;
  private sessionIdentity: string | null = null;
  private lifecycleGeneration = 0;
  private unsubscribeToken: (() => void) | null = null;
  private unsubscribeQueueState: (() => void) | null = null;
  private unsubscribeQueueResponses: (() => void) | null = null;
  private unsubscribeWebSocket: (() => void) | null = null;
  private unsubscribeWebSocketConnected: (() => void) | null = null;

  constructor(queryClient: QueryClient) {
    this.queryClient = queryClient;
    this.queue = new SyncQueue(api);
    this.wsClient = new SyncWebSocketClient();
    this.snapshot = { ...this.queue.getState(), conflicts: [], pendingMutations: [] };
  }

  public start(authenticated: boolean, sessionIdentity: string | null = null): void {
    const wasAuthenticated = this.authenticated;
    const sessionChanged = sessionIdentity !== this.sessionIdentity;
    if (authenticated !== this.authenticated || sessionChanged) this.lifecycleGeneration += 1;
    this.authenticated = authenticated;
    this.sessionIdentity = sessionIdentity;
    this.queue.setAuthenticated(authenticated, api.getToken(), sessionIdentity);
    if (!this.started) {
      this.started = true;
      this.queue.start();
      this.unsubscribeQueueState = this.queue.subscribe((state) => void this.refreshSnapshot(state));
      this.unsubscribeQueueResponses = this.queue.subscribeResponses((response) => this.handleResponse(response));
      this.unsubscribeWebSocket = this.wsClient.subscribe((message) => handleSyncInvalidation(this.queue, message));
      this.unsubscribeWebSocketConnected = this.wsClient.subscribeConnected(() => void this.queue.pull());
      this.unsubscribeToken = api.subscribeToken((token) => {
        this.queue.setAuthenticated(this.authenticated, token, this.sessionIdentity);
        this.connectWithToken(token);
      });
      api.setOfflineMutationHandler(this.submit);
    }
    if (authenticated && (!wasAuthenticated || sessionChanged)) this.queue.scheduleFlush(50);
    this.connectWithToken(api.getToken());
  }

  public stop(): void {
    if (!this.started) return;
    this.lifecycleGeneration += 1;
    this.started = false;
    this.authenticated = false;
    this.sessionIdentity = null;
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
    this.queue.setAuthenticated(false, null, null);
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

  public subscribeMutations(listener: SyncMutationListener): () => void {
    this.mutationListeners.add(listener);
    return () => this.mutationListeners.delete(listener);
  }

  public subscribeResponses(listener: SyncResponseListener): () => void {
    this.responseListeners.add(listener);
    return () => this.responseListeners.delete(listener);
  }

  public submit = async <T,>(input: OfflineMutationInput<T>): Promise<T> => {
    const entityType = input.kind.startsWith('ai.') ? 'aijob' : input.kind.split('.')[0];
    const cachedEntity = findCachedEntity(this.queryClient, input.entityId);
    const baseVersion =
      input.baseVersion ??
      (cachedEntity && typeof cachedEntity.version === 'number' ? cachedEntity.version : undefined);
    const baseValues = input.baseValues ?? pickBaseValues(cachedEntity, input.payload);
    const mutationId = createUlid();
    this.mutationListeners.forEach((listener) =>
      listener({
        mutationId,
        input: { kind: input.kind, entityId: input.entityId, payload: input.payload, optimistic: input.optimistic },
        cachedEntity,
      }),
    );
    applySyncChanges(this.queryClient, {
      acknowledgedMutationIds: [],
      cursor: '',
      conflicts: [],
      changes: [{ entityType, entityId: input.entityId, deleted: input.kind.endsWith('.delete'), data: input.optimistic }],
    });
    this.queue.broadcastOptimisticChange({
      entityType,
      entityId: input.entityId,
      deleted: input.kind.endsWith('.delete'),
      data: input.optimistic,
    });
    await this.queue.enqueue(
      {
        id: mutationId,
        kind: input.kind,
        entityId: input.entityId,
        baseVersion,
        baseValues,
        fieldEditedAt: input.fieldEditedAt,
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

  private connectWithToken = (token: string | null): void => {
    const lifecycleGeneration = this.lifecycleGeneration;
    const sessionIdentity = this.sessionIdentity;
    const { deviceId, clientInstanceId } = this.queue.getIdentity();
    if (!token || !this.authenticated) {
      this.wsClient.disconnect();
      return;
    }
    void offlineSyncStore
      .getCursor()
      .then((cursor) => {
        if (!this.isCurrentLifecycle(lifecycleGeneration, sessionIdentity)) return undefined;
        return api.registerSyncDevice({ deviceId, lastKnownSyncCursor: cursor });
      })
      .then(() => {
        if (this.isCurrentLifecycle(lifecycleGeneration, sessionIdentity) && api.getToken() === token) {
          this.wsClient.connect(token, deviceId, clientInstanceId);
        }
      })
      .catch(() => undefined);
  };

  private readonly handleResponse = async (response: SyncResponse): Promise<void> => {
    const lifecycleGeneration = this.lifecycleGeneration;
    const sessionIdentity = this.sessionIdentity;
    const isCurrent = () => this.isCurrentLifecycle(lifecycleGeneration, sessionIdentity);
    if (!isCurrent()) return;
    this.responseListeners.forEach((listener) => listener(response));
    if (response.localOnly) {
      applySyncChanges(this.queryClient, response);
      return;
    }
    await invalidateSyncChanges(this.queryClient, response);
    if (!isCurrent()) return;
  };

  private isCurrentLifecycle(generation: number, sessionIdentity: string | null): boolean {
    return this.started && this.authenticated && generation === this.lifecycleGeneration && sessionIdentity === this.sessionIdentity;
  }

  private async refreshSnapshot(state = this.queue.getState()): Promise<void> {
    const lifecycleGeneration = this.lifecycleGeneration;
    const sessionIdentity = this.sessionIdentity;
    const [conflicts, pendingMutations] = await Promise.all([
      this.queue.listConflicts(),
      this.queue.listPendingMutations(),
    ]);
    if (!this.isCurrentLifecycle(lifecycleGeneration, sessionIdentity)) return;
    this.updateSnapshot({ ...state, conflicts, pendingMutations });
  }

  private updateSnapshot(next: Partial<SyncSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
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
    sync.start(auth.isAuthenticated, auth.user?.id ?? null);
  }, [auth.isAuthenticated, auth.user?.id, sync]);

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
      subscribeMutations: (listener: SyncMutationListener) => sync.subscribeMutations(listener),
      subscribeResponses: (listener: SyncResponseListener) => sync.subscribeResponses(listener),
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

function handleSyncInvalidation(syncQueue: Pick<SyncQueue, 'pull'>, message: SyncInvalidationMessage): void {
  void syncQueue.pull(message.cursor);
}

function findCachedEntity(queryClient: QueryClient, entityId: string): Record<string, unknown> | undefined {
  for (const [, data] of queryClient.getQueriesData({})) {
    const entity = findEntity(data, entityId);
    if (entity) return entity;
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
