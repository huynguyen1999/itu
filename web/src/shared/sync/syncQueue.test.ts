import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, HttpClient } from '../api/httpClient';
import { offlineSyncStore } from './offlineStore';
import {
  calculateRetryDelay,
  coalesceMutation,
  shouldAutoRebaseConflict,
  shouldAutomaticallyRetryErrorCode,
  supersededGrowthMappingMutationIds,
  SyncQueue,
  type ClientSyncMutation,
} from './syncQueue';

const base: ClientSyncMutation = {
  id: 'mutation-1',
  kind: 'task.update',
  entityId: 'task-1',
  baseVersion: 2,
  payload: { title: 'First' },
  baseValues: { title: 'Original' },
  occurredAt: '2026-07-25T00:00:00.000Z',
};

describe('coalesceMutation', () => {
  it('merges successive unsent updates and retains the original base version', () => {
    const result = coalesceMutation([base], {
      ...base,
      id: 'mutation-2',
      baseVersion: 3,
      payload: { descriptionMarkdown: 'Second' },
      baseValues: { descriptionMarkdown: '' },
    });

    expect(result).toEqual({
      replacedId: 'mutation-1',
      mutation: {
        ...base,
        payload: { title: 'First', descriptionMarkdown: 'Second' },
        baseValues: { descriptionMarkdown: '', title: 'Original' },
      },
    });
  });

  it('folds an update into a pending create without changing operation order', () => {
    const create = { ...base, kind: 'task.create', baseVersion: undefined };
    const result = coalesceMutation([create], {
      ...base,
      id: 'mutation-2',
      payload: { title: 'Updated before upload' },
    });

    expect(result.mutation.kind).toBe('task.create');
    expect(result.mutation.id).toBe(create.id);
    expect(result.mutation.payload).toEqual({ title: 'Updated before upload' });
  });

  it('keeps delete operations separate', () => {
    const deletion = { ...base, id: 'mutation-delete', kind: 'task.delete', payload: {} };
    expect(coalesceMutation([base], deletion)).toEqual({ mutation: deletion });
  });

  it('does not rewrite an attempted mutation with a different payload', () => {
    const next = { ...base, id: 'mutation-2', payload: { status: 'COMPLETED' } };

    expect(coalesceMutation([{ ...base, attemptCount: 1, lastAttemptAt: '2026-07-25T00:00:01.000Z' }], next)).toEqual({
      mutation: next,
    });
  });

  it('coalesces a newer mapping edit over an older failed mapping mutation', () => {
    const failedMapping: ClientSyncMutation = {
      id: 'mapping-old',
      kind: 'growthattributemapping.upsert',
      entityId: 'skill-1',
      payload: { skillId: 'skill-1', mappings: [{ attributeId: 'strength', slot: 'PRIMARY', weight: 100 }] },
      occurredAt: '2026-07-25T00:00:00.000Z',
      attemptCount: 1,
      lastAttemptAt: '2026-07-25T00:00:01.000Z',
      lastErrorCode: 'CLIENT',
    };
    const nextMapping: ClientSyncMutation = {
      ...failedMapping,
      id: 'mapping-new',
      payload: { skillId: 'skill-1', mappings: [{ attributeId: 'focus', slot: 'PRIMARY', weight: 100 }] },
      occurredAt: '2026-07-25T00:01:00.000Z',
      attemptCount: undefined,
      lastAttemptAt: undefined,
      lastErrorCode: undefined,
    };

    expect(coalesceMutation([failedMapping], nextMapping)).toEqual({
      replacedId: 'mapping-old',
      mutation: {
        ...nextMapping,
        id: 'mapping-old',
        baseVersion: undefined,
        baseValues: {},
        payload: nextMapping.payload,
        occurredAt: failedMapping.occurredAt,
      },
    });
  });

  it('cleans an older failed mapping row after a newer mapping mutation is acknowledged', () => {
    const oldFailed: ClientSyncMutation = {
      ...base,
      id: 'mapping-old-failed',
      kind: 'growthattributemapping.upsert',
      entityId: 'skill-1',
      occurredAt: '2026-07-25T00:00:00.000Z',
      attemptCount: 1,
      lastErrorCode: 'CLIENT',
    };
    const newerAcked: ClientSyncMutation = {
      ...oldFailed,
      id: 'mapping-new-acked',
      occurredAt: '2026-07-25T00:01:00.000Z',
      attemptCount: undefined,
      lastErrorCode: undefined,
    };
    const newerInFlight: ClientSyncMutation = {
      ...newerAcked,
      id: 'mapping-later-in-flight',
      occurredAt: '2026-07-25T00:02:00.000Z',
    };

    expect(
      supersededGrowthMappingMutationIds(
        [oldFailed, newerAcked, newerInFlight],
        ['mapping-new-acked'],
        new Set(['mapping-later-in-flight']),
      ),
    ).toEqual(['mapping-old-failed']);
    expect(supersededGrowthMappingMutationIds([oldFailed, newerAcked], ['mapping-old-failed'])).toEqual([]);
    expect(
      supersededGrowthMappingMutationIds([oldFailed], ['mapping-new-acked'], new Set(), [newerAcked]),
    ).toEqual(['mapping-old-failed']);
  });
});

describe('SyncQueue transport split', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('pulls WebSocket changes without posting the mutation queue', async () => {
    installBrowserGlobals();
    vi.spyOn(offlineSyncStore, 'getCursor').mockResolvedValue('5');
    vi.spyOn(offlineSyncStore, 'setCursor').mockResolvedValue();
    vi.spyOn(offlineSyncStore, 'deleteMutations').mockResolvedValue();
    vi.spyOn(offlineSyncStore, 'putConflicts').mockResolvedValue();
    vi.spyOn(offlineSyncStore, 'listMutations').mockResolvedValue([]);
    vi.spyOn(offlineSyncStore, 'listConflicts').mockResolvedValue([]);
    const request = vi.fn().mockResolvedValue({
      cursor: '6',
      lastSyncTime: '2026-07-25T00:00:00.000Z',
      changes: [],
    });
    const queue = new SyncQueue({ request } as unknown as HttpClient);
    const phases: string[] = [];
    queue.subscribe((state) => phases.push(state.phase));

    await queue.pull('6');

    expect(phases).toContain('syncing');
    expect(queue.getState().phase).toBe('up-to-date');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(expect.stringContaining('/sync/changes?'));
    expect(request).not.toHaveBeenCalledWith('/sync/mutations', expect.anything());
  });

  it('keeps the local queue usable without sending network requests while signed out', async () => {
    installBrowserGlobals();
    vi.spyOn(offlineSyncStore, 'listMutations').mockResolvedValue([]);
    vi.spyOn(offlineSyncStore, 'listConflicts').mockResolvedValue([]);
    const request = vi.fn();
    const queue = new SyncQueue({ request } as unknown as HttpClient);

    queue.setAuthenticated(false);
    await queue.flush(true);
    await queue.pull();

    expect(request).not.toHaveBeenCalled();
    expect(queue.getState().phase).toBe('up-to-date');
  });

  it('discards an in-flight response after the authenticated session changes', async () => {
    installBrowserGlobals();
    const mutation: ClientSyncMutation = {
      ...base,
      id: 'in-flight-mutation',
    };
    vi.spyOn(offlineSyncStore, 'listMutations').mockResolvedValue([mutation]);
    vi.spyOn(offlineSyncStore, 'listConflicts').mockResolvedValue([]);
    vi.spyOn(offlineSyncStore, 'getCursor').mockResolvedValue('1');
    vi.spyOn(offlineSyncStore, 'setCursor').mockResolvedValue();
    const deleteMutations = vi.spyOn(offlineSyncStore, 'deleteMutations').mockResolvedValue();
    let resolvePush!: (response: unknown) => void;
    const pushResponse = new Promise((resolve) => {
      resolvePush = resolve;
    });
    const request = vi.fn().mockReturnValue(pushResponse);
    const queue = new SyncQueue({ request } as unknown as HttpClient);
    queue.setAuthenticated(true, 'session-a');

    const flush = queue.flush(true);
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('/sync/mutations', expect.anything()));
    queue.setAuthenticated(true, 'session-b');
    resolvePush({
      acknowledgedMutationIds: ['in-flight-mutation'],
      conflicts: [],
      latestServerCursor: '2',
      mutationOutcomes: [],
    });
    await flush;

    expect(deleteMutations).not.toHaveBeenCalled();
  });

  it('requests a fresh snapshot when the WebSocket cursor is behind the persisted cursor', async () => {
    installBrowserGlobals();
    vi.spyOn(offlineSyncStore, 'getCursor').mockResolvedValue('1730');
    vi.spyOn(offlineSyncStore, 'setCursor').mockResolvedValue();
    vi.spyOn(offlineSyncStore, 'deleteMutations').mockResolvedValue();
    vi.spyOn(offlineSyncStore, 'putConflicts').mockResolvedValue();
    vi.spyOn(offlineSyncStore, 'listMutations').mockResolvedValue([]);
    vi.spyOn(offlineSyncStore, 'listConflicts').mockResolvedValue([]);
    const request = vi.fn().mockResolvedValue({
      cursor: '99',
      lastSyncTime: '2026-07-30T00:00:00.000Z',
      changes: [],
    });
    const queue = new SyncQueue({ request } as unknown as HttpClient);

    await queue.pull('99');

    expect(request).toHaveBeenCalledWith(expect.stringContaining('cursor=0'));
    expect(offlineSyncStore.setCursor).toHaveBeenCalledWith('99');
  });

  it('reconciles changes after a browser tab becomes visible again', async () => {
    installBrowserGlobals();
    const lifecycle = installLifecycleGlobals('visible');
    vi.spyOn(offlineSyncStore, 'migrateLegacyState').mockResolvedValue();
    vi.spyOn(offlineSyncStore, 'listMutations').mockResolvedValue([]);
    vi.spyOn(offlineSyncStore, 'listConflicts').mockResolvedValue([]);
    const queue = new SyncQueue({ request: vi.fn() } as unknown as HttpClient);
    const pull = vi.spyOn(queue, 'pull').mockResolvedValue(null);

    queue.start();
    await vi.waitFor(() => expect(offlineSyncStore.listMutations).toHaveBeenCalled());
    lifecycle.dispatch('visibilitychange');

    expect(pull).toHaveBeenCalledTimes(1);
    queue.stop();
  });

  it('periodically reconciles while visible if a WebSocket notification is missed', async () => {
    vi.useFakeTimers();
    installBrowserGlobals();
    installLifecycleGlobals('visible');
    vi.spyOn(offlineSyncStore, 'migrateLegacyState').mockResolvedValue();
    vi.spyOn(offlineSyncStore, 'listMutations').mockResolvedValue([]);
    vi.spyOn(offlineSyncStore, 'listConflicts').mockResolvedValue([]);
    const queue = new SyncQueue({ request: vi.fn() } as unknown as HttpClient);
    const pull = vi.spyOn(queue, 'pull').mockResolvedValue(null);

    queue.start();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(pull).toHaveBeenCalledTimes(1);
    queue.stop();
  });

  it('keeps failed mutation payloads and records durable retry metadata', async () => {
    vi.useFakeTimers();
    installBrowserGlobals();
    vi.spyOn(offlineSyncStore, 'getCursor').mockResolvedValue('5');
    vi.spyOn(offlineSyncStore, 'listMutations').mockResolvedValue([base]);
    vi.spyOn(offlineSyncStore, 'listConflicts').mockResolvedValue([]);
    const markFailed = vi.spyOn(offlineSyncStore, 'markMutationsFailed').mockResolvedValue();
    const queue = new SyncQueue({ request: vi.fn().mockRejectedValue(new Error('network')) } as unknown as HttpClient);
    vi.spyOn(queue, 'scheduleFlush').mockImplementation(() => undefined);

    await queue.flush(true);

    expect(markFailed).toHaveBeenCalledWith(
      ['mutation-1'],
      expect.objectContaining({
        attemptCount: 1,
        lastErrorCode: 'NETWORK_OR_UNKNOWN',
        lastAttemptAt: expect.any(String),
        nextRetryAt: expect.any(String),
      }),
    );
    expect(offlineSyncStore.listMutations).toHaveBeenCalled();
  });

  it('rotates only a reused mutation ID and automatically retries the queued batch', async () => {
    installBrowserGlobals();
    const pending: ClientSyncMutation[] = [
      { ...base },
      { ...base, id: 'mutation-2', entityId: 'task-2', payload: { status: 'COMPLETED' } },
    ];
    vi.spyOn(offlineSyncStore, 'getCursor').mockResolvedValue('5');
    vi.spyOn(offlineSyncStore, 'setCursor').mockResolvedValue();
    vi.spyOn(offlineSyncStore, 'acquireLease').mockResolvedValue({
      ownerId: 'client-1',
      token: 'lease-1',
      expiresAt: Date.now() + 5000,
    });
    vi.spyOn(offlineSyncStore, 'releaseLease').mockResolvedValue();
    vi.spyOn(offlineSyncStore, 'listMutations').mockImplementation(async () => [...pending]);
    vi.spyOn(offlineSyncStore, 'listConflicts').mockResolvedValue([]);
    vi.spyOn(offlineSyncStore, 'putConflicts').mockResolvedValue();
    const replaceMutation = vi
      .spyOn(offlineSyncStore, 'replaceMutation')
      .mockImplementation(async (previousId, next) => {
        const index = pending.findIndex((mutation) => mutation.id === previousId);
        if (index >= 0) pending.splice(index, 1, next);
      });
    vi.spyOn(offlineSyncStore, 'deleteMutations').mockImplementation(async (ids) => {
      for (const id of ids) {
        const index = pending.findIndex((mutation) => mutation.id === id);
        if (index >= 0) pending.splice(index, 1);
      }
    });
    const markFailed = vi.spyOn(offlineSyncStore, 'markMutationsFailed').mockResolvedValue();
    let pushCount = 0;
    const sentBatches: string[][] = [];
    const request = vi.fn().mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/sync/mutations') {
        pushCount += 1;
        const sent = JSON.parse(String(init?.body)) as { mutations: ClientSyncMutation[] };
        sentBatches.push(sent.mutations.map((mutation) => mutation.id));
        if (pushCount === 1) {
          throw new ApiRequestError(
            'Mutation ID was reused with a different operation',
            400,
            undefined,
            'INVALID_SYNC_MUTATION',
            { reason: 'MUTATION_ID_REUSED', mutationId: 'mutation-1' },
          );
        }
        return {
          acknowledgedMutationIds: sent.mutations.map((mutation) => mutation.id),
          conflicts: [],
          latestServerCursor: '6',
          mutationOutcomes: [],
        };
      }
      return { cursor: '6', changes: [] };
    });
    const queue = new SyncQueue({ request } as unknown as HttpClient);

    await queue.flush(true);

    await vi.waitFor(() => expect(pushCount).toBe(2));
    const repaired = replaceMutation.mock.calls[0]?.[1];
    expect(repaired?.id).not.toBe('mutation-1');
    expect(repaired?.entityId).toBe('task-1');
    expect(sentBatches).toEqual([
      ['mutation-1', 'mutation-2'],
      [repaired?.id, 'mutation-2'],
    ]);
    expect(markFailed).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(pending).toEqual([]));
  });

  it('retries after another tab temporarily owns the sync lease', async () => {
    vi.useFakeTimers();
    installBrowserGlobals();
    vi.spyOn(offlineSyncStore, 'acquireLease').mockResolvedValue(null);
    const queue = new SyncQueue({ request: vi.fn() } as unknown as HttpClient);
    const scheduleFlush = vi.spyOn(queue, 'scheduleFlush').mockImplementation(() => undefined);

    await queue.flush();

    expect(scheduleFlush).toHaveBeenCalledWith(5000);
  });

  it('retries an immediate mutation promptly when another tab owns the sync lease', async () => {
    installBrowserGlobals();
    vi.spyOn(offlineSyncStore, 'listMutations').mockResolvedValue([]);
    vi.spyOn(offlineSyncStore, 'listConflicts').mockResolvedValue([]);
    vi.spyOn(offlineSyncStore, 'putMutation').mockResolvedValue();
    vi.spyOn(offlineSyncStore, 'acquireLease').mockResolvedValue(null);
    const queue = new SyncQueue({ request: vi.fn() } as unknown as HttpClient);
    const scheduleFlush = vi.spyOn(queue, 'scheduleFlush').mockImplementation(() => undefined);

    await queue.enqueue({ ...base, payload: { status: 'COMPLETED' } }, true);

    await vi.waitFor(() => expect(scheduleFlush).toHaveBeenCalledWith(50));
  });

  it('replaces failed mapping edits and removes their stale conflict when a newer edit is queued', async () => {
    installBrowserGlobals();
    const failed: ClientSyncMutation = {
      id: 'mapping-old',
      kind: 'growthattributemapping.upsert',
      entityId: 'skill-1',
      payload: { skillId: 'skill-1', mappings: [] },
      occurredAt: '2026-07-25T00:00:00.000Z',
      attemptCount: 1,
      lastErrorCode: 'CLIENT',
    };
    const pending = [failed];
    vi.spyOn(offlineSyncStore, 'listMutations').mockImplementation(async () => [...pending]);
    vi.spyOn(offlineSyncStore, 'listConflicts').mockResolvedValue([]);
    const replaceMutation = vi.spyOn(offlineSyncStore, 'replaceMutation').mockImplementation(async (id, next) => {
      const index = pending.findIndex((mutation) => mutation.id === id);
      pending.splice(index, 1, next);
    });
    const deleteConflict = vi.spyOn(offlineSyncStore, 'deleteConflict').mockResolvedValue();
    vi.spyOn(offlineSyncStore, 'acquireLease').mockResolvedValue(null);
    const queue = new SyncQueue({ request: vi.fn() } as unknown as HttpClient);

    await queue.enqueue(
      {
        ...failed,
        id: 'mapping-new',
        payload: { skillId: 'skill-1', mappings: [{ attributeId: 'focus', slot: 'PRIMARY', weight: 100 }] },
        occurredAt: '2026-07-25T00:01:00.000Z',
        attemptCount: undefined,
        lastErrorCode: undefined,
      },
      false,
    );

    expect(replaceMutation).toHaveBeenCalledWith('mapping-old', expect.objectContaining({ id: 'mapping-old' }));
    expect(deleteConflict).toHaveBeenCalledWith('mapping-old');
    expect(pending[0]).toMatchObject({ id: 'mapping-old', payload: { mappings: [{ attributeId: 'focus' }] } });
  });

  it('keeps a new immediate update separate from the same entity update already in flight', async () => {
    installBrowserGlobals();
    const pending: ClientSyncMutation[] = [{ ...base }];
    vi.spyOn(offlineSyncStore, 'getCursor').mockResolvedValue('5');
    vi.spyOn(offlineSyncStore, 'setCursor').mockResolvedValue();
    vi.spyOn(offlineSyncStore, 'acquireLease').mockResolvedValue({
      ownerId: 'client-1',
      token: 'lease-2',
      expiresAt: Date.now() + 5000,
    });
    const releaseLease = vi.spyOn(offlineSyncStore, 'releaseLease').mockResolvedValue();
    vi.spyOn(offlineSyncStore, 'listMutations').mockImplementation(async () => [...pending]);
    vi.spyOn(offlineSyncStore, 'listConflicts').mockResolvedValue([]);
    vi.spyOn(offlineSyncStore, 'putMutation').mockImplementation(async (mutation) => {
      pending.push(mutation);
    });
    vi.spyOn(offlineSyncStore, 'deleteMutations').mockImplementation(async (ids) => {
      for (const id of ids) {
        const index = pending.findIndex((mutation) => mutation.id === id);
        if (index >= 0) pending.splice(index, 1);
      }
    });
    vi.spyOn(offlineSyncStore, 'putConflicts').mockResolvedValue();
    let releaseFirstPush!: () => void;
    const firstPush = new Promise<void>((resolve) => {
      releaseFirstPush = resolve;
    });
    let pushCount = 0;
    const sentBatches: string[][] = [];
    const request = vi.fn().mockImplementation(async (path: string) => {
      if (path === '/sync/mutations') {
        pushCount += 1;
        const sentIds = pending.map((mutation) => mutation.id);
        sentBatches.push(sentIds);
        if (pushCount === 1) await firstPush;
        return {
          acknowledgedMutationIds: sentIds,
          conflicts: [],
          latestServerCursor: '6',
          mutationOutcomes: [],
        };
      }
      return { cursor: '6', changes: [] };
    });
    const queue = new SyncQueue({ request } as unknown as HttpClient);
    const firstFlush = queue.flush(true);
    await vi.waitFor(() => expect(pushCount).toBe(1));

    await queue.enqueue(
      {
        ...base,
        id: 'mutation-status',
        payload: { status: 'COMPLETED' },
      },
      true,
    );
    releaseFirstPush();
    await firstFlush;

    await vi.waitFor(() => expect(pushCount).toBe(2));
    expect(pending).toEqual([]);
    expect(sentBatches).toEqual([['mutation-1'], ['mutation-status']]);
    await vi.waitFor(() => expect(queue.getState().phase).toBe('up-to-date'));
    expect(releaseLease).toHaveBeenCalled();
  });

  it('uses a fresh mutation ID when the user retries with Keep local', async () => {
    installBrowserGlobals();
    const pending: ClientSyncMutation[] = [{ ...base, attemptCount: 1, lastErrorCode: 'CLIENT' }];
    vi.spyOn(offlineSyncStore, 'listMutations').mockImplementation(async () => [...pending]);
    vi.spyOn(offlineSyncStore, 'listConflicts').mockResolvedValue([]);
    const replaceMutation = vi
      .spyOn(offlineSyncStore, 'replaceMutation')
      .mockImplementation(async (previousId, next) => {
        const index = pending.findIndex((mutation) => mutation.id === previousId);
        if (index >= 0) pending.splice(index, 1, next);
      });
    vi.spyOn(offlineSyncStore, 'getCursor').mockResolvedValue('5');
    vi.spyOn(offlineSyncStore, 'setCursor').mockResolvedValue();
    vi.spyOn(offlineSyncStore, 'deleteMutations').mockImplementation(async (ids) => {
      ids.forEach((id) => {
        const index = pending.findIndex((mutation) => mutation.id === id);
        if (index >= 0) pending.splice(index, 1);
      });
    });
    vi.spyOn(offlineSyncStore, 'putConflicts').mockResolvedValue();
    const request = vi.fn().mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/sync/mutations') {
        const sent = JSON.parse(String(init?.body)) as { mutations: ClientSyncMutation[] };
        return {
          acknowledgedMutationIds: sent.mutations.map((mutation) => mutation.id),
          conflicts: [],
          latestServerCursor: '6',
          mutationOutcomes: [],
        };
      }
      return { cursor: '6', changes: [] };
    });
    const queue = new SyncQueue({ request } as unknown as HttpClient);

    await queue.retryMutation('mutation-1', true);

    const retried = replaceMutation.mock.calls[0]?.[1];
    expect(retried?.id).not.toBe('mutation-1');
    expect(retried?.baseVersion).toBeUndefined();
    expect(retried?.baseValues).toBeUndefined();
    expect(request).toHaveBeenCalledWith(
      '/sync/mutations',
      expect.objectContaining({ body: expect.stringContaining(`"id":"${retried?.id}"`) }),
    );
  });

  it('lets the user discard one pending mutation', async () => {
    installBrowserGlobals();
    vi.spyOn(offlineSyncStore, 'deleteConflict').mockResolvedValue();
    const deleteMutations = vi.spyOn(offlineSyncStore, 'deleteMutations').mockResolvedValue();
    vi.spyOn(offlineSyncStore, 'listMutations').mockResolvedValue([]);
    vi.spyOn(offlineSyncStore, 'listConflicts').mockResolvedValue([]);
    const queue = new SyncQueue({ request: vi.fn() } as unknown as HttpClient);

    await queue.discardMutation('mutation-1');

    expect(deleteMutations).toHaveBeenCalledWith(['mutation-1']);
  });
});

describe('sync retry policy', () => {
  it('uses capped exponential backoff with jitter', () => {
    expect(calculateRetryDelay(1, undefined, () => 0)).toBe(500);
    expect(calculateRetryDelay(3, undefined, () => 0.5)).toBe(4000);
    expect(calculateRetryDelay(10, undefined, () => 0.5)).toBe(30_000);
  });

  it('honors a longer server Retry-After delay', () => {
    expect(calculateRetryDelay(1, 12_000, () => 0)).toBe(12_000);
  });

  it('waits for user reconciliation after permanent failures', () => {
    expect(shouldAutomaticallyRetryErrorCode('CLIENT')).toBe(false);
    expect(shouldAutomaticallyRetryErrorCode('AUTH')).toBe(false);
    expect(shouldAutomaticallyRetryErrorCode('SERVER')).toBe(true);
    expect(shouldAutomaticallyRetryErrorCode('NETWORK_OR_UNKNOWN')).toBe(true);
  });
});

describe('sync conflict policy', () => {
  it('automatically rebases routine task status conflicts', () => {
    expect(
      shouldAutoRebaseConflict({
        mutationId: 'mutation-1',
        entityType: 'task',
        entityId: 'task-1',
        reason: 'STALE_VERSION',
        serverData: { version: 3, status: 'IN_PROGRESS' },
        localDraft: { status: 'COMPLETED' },
        conflictingFields: ['status'],
        kind: 'task.update',
      }),
    ).toBe(true);
  });

  it('keeps content conflicts for manual resolution', () => {
    expect(
      shouldAutoRebaseConflict({
        mutationId: 'mutation-1',
        entityType: 'task',
        entityId: 'task-1',
        reason: 'STALE_VERSION',
        serverData: { version: 3, title: 'Server title' },
        localDraft: { title: 'Local title' },
        conflictingFields: ['title'],
        kind: 'task.update',
      }),
    ).toBe(false);
  });
});

function installBrowserGlobals() {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(`session:${key}`) ?? null,
    setItem: (key: string, value: string) => storage.set(`session:${key}`, value),
  });
  vi.stubGlobal('navigator', { onLine: true });
}

function installLifecycleGlobals(visibilityState: 'hidden' | 'visible') {
  const listeners = new Map<string, Set<EventListener>>();
  const windowStub = {
    addEventListener: (type: string, listener: EventListener) => {
      const registered = listeners.get(type) ?? new Set<EventListener>();
      registered.add(listener);
      listeners.set(type, registered);
    },
    removeEventListener: (type: string, listener: EventListener) => {
      listeners.get(type)?.delete(listener);
    },
  };
  class BroadcastChannelStub {
    addEventListener() {}
    removeEventListener() {}
    postMessage() {}
    close() {}
  }
  vi.stubGlobal('window', windowStub);
  vi.stubGlobal('document', { visibilityState });
  vi.stubGlobal('BroadcastChannel', BroadcastChannelStub);
  return {
    dispatch(type: string) {
      listeners.get(type)?.forEach((listener) => listener(new Event(type)));
    },
  };
}
