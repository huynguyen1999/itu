import type { SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import {
  coalesceSyncChanges,
  conflictingSyncFields,
  PrismaSyncRepository,
  shouldCreateSyncSnapshot,
} from './prisma-sync.repository';

const mutation: SyncMutation = {
  id: 'mutation-1',
  kind: 'task.update',
  entityId: 'task-1',
  baseVersion: 1,
  baseValues: { title: 'Original title' },
  payload: { title: 'Offline title' },
  occurredAt: '2026-07-25T00:00:00.000Z',
};

describe('sync field conflict detection', () => {
  it('merges when the server changed only unrelated fields', () => {
    expect(
      conflictingSyncFields(mutation, {
        id: 'task-1',
        version: 2,
        title: 'Original title',
        priority: 'HIGH',
      }),
    ).toEqual([]);
  });

  it('reports fields changed by both the server and offline draft', () => {
    expect(
      conflictingSyncFields(mutation, {
        id: 'task-1',
        version: 2,
        title: 'Server title',
      }),
    ).toEqual(['title']);
  });

  it('compares tag assignments independent of ordering', () => {
    const tagMutation = {
      ...mutation,
      baseValues: { tagIds: ['tag-1', 'tag-2'] },
      payload: { tagIds: ['tag-1', 'tag-3'] },
    };
    expect(
      conflictingSyncFields(tagMutation, {
        tags: [{ tag: { id: 'tag-2' } }, { tag: { id: 'tag-1' } }],
      }),
    ).toEqual([]);
  });

  it('keeps legacy queued mutations explicit when base values are unavailable', () => {
    expect(conflictingSyncFields({ ...mutation, baseValues: undefined }, { title: 'Original title' })).toEqual([
      'title',
    ]);
  });
});

describe('sync change coalescing', () => {
  it('rebuilds the snapshot when the client cursor is ahead of the server', () => {
    expect(shouldCreateSyncSnapshot(1730, 99)).toBe(true);
  });

  it('keeps only the final ordered change for each resource', () => {
    expect(
      coalesceSyncChanges([
        { cursor: 10, entityType: 'task', entityId: 'task-1', deleted: false, data: { title: 'First' } },
        { cursor: 11, entityType: 'deck', entityId: 'deck-1', deleted: false, data: { title: 'Deck' } },
        { cursor: 12, entityType: 'task', entityId: 'task-1', deleted: true, data: { id: 'task-1' } },
      ]),
    ).toEqual([
      { cursor: 11, entityType: 'deck', entityId: 'deck-1', deleted: false, data: { title: 'Deck' } },
      { cursor: 12, entityType: 'task', entityId: 'task-1', deleted: true, data: { id: 'task-1' } },
    ]);
  });
});

describe('sync mutation transaction scope', () => {
  it('assigns offline task creation to the existing default Inbox list when no list is provided', async () => {
    const entityId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    const taskCreateMutation: SyncMutation = {
      id: 'mutation-task-create',
      kind: 'task.create',
      entityId,
      payload: { title: 'Offline task' },
      occurredAt: '2026-07-25T00:00:00.000Z',
    };
    const tx = {
      syncMutation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(undefined),
      },
      taskList: {
        findFirst: jest.fn().mockResolvedValue({ id: 'inbox-list' }),
        create: jest.fn(),
      },
      task: {
        upsert: jest.fn().mockResolvedValue({ id: entityId }),
        findFirst: jest.fn().mockResolvedValue({ id: entityId, taskListId: 'inbox-list' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: entityId, taskListId: 'inbox-list' }),
      },
      growthProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'profile-1', activeCycleId: 'cycle-1', rewardPreset: 'BALANCED' }),
      },
      growthSkill: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      growthEarningRule: {
        create: jest.fn().mockResolvedValue({ id: 'rule-1' }),
      },
      growthRewardPresetSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      syncChange: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const transaction = jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    const repository = new PrismaSyncRepository({ $transaction: transaction } as never, {} as never);

    await repository.applyMutations('user-1', 'device-1', [taskCreateMutation]);

    expect(tx.task.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ taskListId: 'inbox-list' }),
      }),
    );
  });

  it('replays duplicate task.create mutations without overwriting its custom growth rule', async () => {
    const entityId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    const mutations: SyncMutation[] = [
      { id: 'task-create-1', kind: 'task.create', entityId, payload: { title: 'Offline task' }, occurredAt: '2026-07-25T00:00:00.000Z' },
      { id: 'task-create-2', kind: 'task.create', entityId, payload: { title: 'Offline task (retry)' }, occurredAt: '2026-07-25T00:00:01.000Z' },
    ];
    const customRule = { id: 'custom-rule', coinReward: 99, accountXp: 77 };
    const tx = {
      syncMutation: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(undefined) },
      taskList: { findFirst: jest.fn().mockResolvedValue({ id: 'inbox-list' }), create: jest.fn() },
      task: {
        upsert: jest.fn().mockResolvedValue({ id: entityId, taskListId: 'inbox-list' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: entityId, taskListId: 'inbox-list' }),
      },
      growthTaskRewardDefault: { findFirst: jest.fn() },
      growthRewardPresetSetting: { findUnique: jest.fn() },
      growthEarningRule: { findUnique: jest.fn().mockResolvedValue(customRule), create: jest.fn() },
      syncChange: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const transaction = jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    const repository = new PrismaSyncRepository({ $transaction: transaction } as never, {} as never);

    await expect(repository.applyMutations('user-1', 'device-1', mutations)).resolves.toMatchObject({
      acknowledgedMutationIds: ['task-create-1', 'task-create-2'],
    });
    expect(tx.growthEarningRule.findUnique).toHaveBeenCalledTimes(2);
    expect(tx.growthEarningRule.create).not.toHaveBeenCalled();
    expect(tx.task.upsert).toHaveBeenCalledTimes(2);
  });

  it('uses a separate transaction for each mutation in an uploaded batch', async () => {
    const mutations = [
      mutation,
      {
        ...mutation,
        id: 'mutation-2',
        entityId: 'task-2',
        payload: { title: 'Second offline title' },
      },
    ];
    const tx = {
      syncMutation: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) => {
          const existing = mutations.find((item) => item.id === where.id);
          return Promise.resolve(
            existing
              ? {
                  id: existing.id,
                  userId: 'user-1',
                  kind: existing.kind,
                  entityId: existing.entityId,
                  payload: existing.payload,
                  result: null,
                }
              : null,
          );
        }),
      },
    };
    const transaction = jest.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx));
    const repository = new PrismaSyncRepository({ $transaction: transaction } as never, {} as never);

    const result = await repository.applyMutations('user-1', 'device-1', mutations);

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(result.acknowledgedMutationIds).toEqual(['mutation-1', 'mutation-2']);
  });

  it('identifies the exact mutation ID when an ID is reused for a different operation', async () => {
    const tx = {
      syncMutation: {
        findUnique: jest.fn().mockResolvedValue({
          id: mutation.id,
          userId: 'user-1',
          kind: mutation.kind,
          entityId: mutation.entityId,
          payload: { title: 'Previously submitted title' },
          result: null,
        }),
      },
    };
    const transaction = jest.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx));
    const repository = new PrismaSyncRepository({ $transaction: transaction } as never, {} as never);

    await expect(repository.applyMutations('user-1', 'device-1', [mutation])).rejects.toMatchObject({
      code: 'INVALID_SYNC_MUTATION',
      details: {
        reason: 'MUTATION_ID_REUSED',
        mutationId: mutation.id,
      },
    });
  });

  it('reports committed mutation IDs when a later mutation fails', async () => {
    const mutations: SyncMutation[] = [
      mutation,
      {
        ...mutation,
        id: 'mutation-2',
        kind: 'unsupported.kind',
        entityId: 'task-2',
        payload: {},
      },
    ];
    const tx = {
      syncMutation: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) => {
          const existing = where.id === mutation.id ? mutation : undefined;
          return Promise.resolve(
            existing
              ? {
                  id: existing.id,
                  userId: 'user-1',
                  kind: existing.kind,
                  entityId: existing.entityId,
                  payload: existing.payload,
                  result: null,
                }
              : null,
          );
        }),
      },
    };
    const transaction = jest.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx));
    const repository = new PrismaSyncRepository({ $transaction: transaction } as never, {} as never);

    await expect(repository.applyMutations('user-1', 'device-1', mutations)).rejects.toMatchObject({
      code: 'INVALID_SYNC_MUTATION',
      details: { acknowledgedMutationIds: ['mutation-1'] },
    });
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
