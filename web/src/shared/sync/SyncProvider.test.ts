import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { GrowthAwardReceipt } from '../api/types';
import { growthCompletionTransition, mergeGrowthReceiptEntries } from '../../features/growth/sync/GrowthSyncBridge';
import { Sync } from './SyncProvider';

function receipt(title: string, amount: number): GrowthAwardReceipt {
  return {
    sourceType: 'TASK',
    sourceId: 'task-1',
    title,
    accountAward: {
      amount,
      beforeXp: 0,
      afterXp: amount,
      beforeLevel: 1,
      afterLevel: 1,
      nextLevelXp: 100,
    },
    progressAwards: [],
    coinAward: null,
    itemAwards: [],
  };
}

describe('sync lifecycle and growth receipt reconciliation', () => {
  it('recognizes a habit check-in that completes its target', () => {
    expect(
      growthCompletionTransition(
        {
          kind: 'habitoccurrence.checkin',
          entityId: 'occurrence-1',
          payload: { value: 1 },
          optimistic: { id: 'occurrence-1', status: 'PENDING' },
        },
        {
          id: 'occurrence-1',
          status: 'PENDING',
          habit: { id: 'habit-1', name: 'Read', direction: 'BUILD', targetValue: 1 },
          progressLogs: [],
          checklistItems: [],
        },
      ),
    ).toMatchObject({
      sourceType: 'HABIT',
      sourceId: 'occurrence-1',
      ruleSourceId: 'habit-1',
      completedAfter: true,
    });
  });

  it('replaces an optimistic receipt with the authoritative outcome', () => {
    const recent = new Set<string>();
    const optimistic = new Set<string>();
    const local = mergeGrowthReceiptEntries(
      [],
      [{ receipt: receipt('local', 5), key: 'mutation-1' }],
      recent,
      optimistic,
    );
    const authoritative = mergeGrowthReceiptEntries(
      local,
      [{ receipt: receipt('server', 7), key: 'mutation-1', authoritative: true }],
      recent,
      optimistic,
    );
    expect(authoritative).toHaveLength(1);
    expect(authoritative[0]).toMatchObject({ title: 'server', receiptKey: 'mutation-1' });
    expect(recent.has('mutation-1')).toBe(true);
  });

  it('shows an acknowledged receipt once when reload happened before acknowledgement', () => {
    const recent = new Set<string>();
    const optimistic = new Set<string>();
    const afterReload = mergeGrowthReceiptEntries(
      [],
      [{ receipt: receipt('server', 7), key: 'mutation-1', authoritative: true }],
      recent,
      optimistic,
    );
    const duplicate = mergeGrowthReceiptEntries(
      afterReload,
      [{ receipt: receipt('server', 7), key: 'mutation-1', authoritative: true }],
      recent,
      optimistic,
    );
    expect(afterReload).toHaveLength(1);
    expect(duplicate).toHaveLength(1);
  });

  it('stops async response cache work when the Sync lifecycle changes', async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(`session:${key}`) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    const queryClient = new QueryClient();
    const sync = new Sync(queryClient);
    const internals = sync as unknown as {
      started: boolean;
      authenticated: boolean;
      sessionIdentity: string | null;
      lifecycleGeneration: number;
      handleResponse(response: unknown): Promise<void>;
    };
    internals.started = true;
    internals.authenticated = true;
    internals.sessionIdentity = 'account-a';
    internals.lifecycleGeneration = 1;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(async () => blocked);
    const handling = internals.handleResponse({
      acknowledgedMutationIds: [],
      cursor: '1',
      changes: [{ entityType: 'task', entityId: 'task-1', deleted: false, data: { id: 'task-1' } }],
      conflicts: [
        {
          mutationId: 'mutation-1',
          entityType: 'growthattributemapping',
          entityId: 'skill-1',
          reason: 'STALE_VERSION',
          serverData: null,
          localDraft: {},
        },
      ],
    });
    await vi.waitFor(() => expect(invalidateQueries).toHaveBeenCalled());
    const callsBeforeLifecycleChange = invalidateQueries.mock.calls.length;
    internals.lifecycleGeneration += 1;
    release();
    await handling;

    expect(invalidateQueries.mock.calls.length).toBe(callsBeforeLifecycleChange);
    vi.unstubAllGlobals();
  });
});
