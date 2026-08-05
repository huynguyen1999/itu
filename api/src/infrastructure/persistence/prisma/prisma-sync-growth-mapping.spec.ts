import type { SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import { PrismaSyncRepository } from './prisma-sync.repository';
import { HABIT_ACTION_MARKER_PREFIX } from './prisma-sync.helpers';

const baseMutation = (payload: Record<string, unknown>, id = 'mapping-mutation-1'): SyncMutation => ({
  id,
  kind: 'growthattributemapping.upsert',
  entityId: 'skill-1',
  payload,
  occurredAt: '2026-07-25T00:00:00.000Z',
});

function createTransaction(overrides: Record<string, unknown> = {}) {
  const tx = {
    syncMutation: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(undefined),
    },
    growthSkill: {
      findFirst: jest.fn().mockResolvedValue({ id: 'skill-1', kind: 'SKILL', archivedAt: null }),
      findMany: jest.fn(),
    },
    growthAttributeMapping: {
      deleteMany: jest.fn().mockResolvedValue(undefined),
      createMany: jest.fn().mockResolvedValue(undefined),
      findMany: jest.fn().mockResolvedValue([]),
    },
    syncChange: { create: jest.fn().mockResolvedValue(undefined) },
    ...overrides,
  };
  const transaction = jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  return { tx, transaction };
}

describe('offline growth attribute mapping sync', () => {
  it('replaces a valid primary/secondary pair atomically and records the grouped change', async () => {
    const { tx, transaction } = createTransaction();
    tx.growthSkill.findMany
      .mockResolvedValueOnce([{ id: 'attribute-1' }, { id: 'attribute-2' }])
      .mockResolvedValueOnce([
        { id: 'mapping-1', skillId: 'skill-1', attributeId: 'attribute-1', slot: 'PRIMARY', weight: 70 },
        { id: 'mapping-2', skillId: 'skill-1', attributeId: 'attribute-2', slot: 'SECONDARY', weight: 30 },
      ]);
    const repository = new PrismaSyncRepository({ $transaction: transaction } as never, {} as never);

    await repository.applyMutations('user-1', 'device-1', [
      baseMutation({
        skillId: 'skill-1',
        mappings: [
          { attributeId: 'attribute-1', slot: 'PRIMARY', weight: 70 },
          { attributeId: 'attribute-2', slot: 'SECONDARY', weight: 30 },
        ],
      }),
    ]);

    expect(tx.growthAttributeMapping.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', skillId: 'skill-1' },
    });
    expect(tx.growthAttributeMapping.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'user-1',
          skillId: 'skill-1',
          attributeId: 'attribute-1',
          slot: 'PRIMARY',
          weight: 70,
        }),
        expect.objectContaining({
          userId: 'user-1',
          skillId: 'skill-1',
          attributeId: 'attribute-2',
          slot: 'SECONDARY',
          weight: 30,
        }),
      ],
    });
    expect(tx.syncChange.create).toHaveBeenCalledTimes(1);
    expect(tx.syncChange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: 'growthattributemapping',
        entityId: 'skill-1',
        operation: 'UPSERT',
        data: expect.any(Array),
      }),
    });
  });

  it('accepts a primary-only mapping', async () => {
    const { tx, transaction } = createTransaction();
    tx.growthSkill.findMany
      .mockResolvedValueOnce([{ id: 'attribute-1' }])
      .mockResolvedValueOnce([
        { id: 'mapping-1', skillId: 'skill-1', attributeId: 'attribute-1', slot: 'PRIMARY', weight: 100 },
      ]);
    const repository = new PrismaSyncRepository({ $transaction: transaction } as never, {} as never);

    await repository.applyMutations('user-1', 'device-1', [
      baseMutation({ skillId: 'skill-1', mappings: [{ attributeId: 'attribute-1', slot: 'PRIMARY', weight: 100 }] }),
    ]);

    expect(tx.growthAttributeMapping.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ slot: 'PRIMARY', weight: 100 })],
    });
  });

  it('rejects fractional weights just like the direct REST DTO', async () => {
    const { tx, transaction } = createTransaction();
    tx.growthSkill.findMany.mockResolvedValueOnce([{ id: 'attribute-1' }]);
    const repository = new PrismaSyncRepository({ $transaction: transaction } as never, {} as never);

    await expect(
      repository.applyMutations('user-1', 'device-1', [
        baseMutation({ skillId: 'skill-1', mappings: [{ attributeId: 'attribute-1', slot: 'PRIMARY', weight: 100.5 }] }),
      ]),
    ).rejects.toMatchObject({ code: 'INVALID_SYNC_MUTATION' });
    expect(tx.growthAttributeMapping.deleteMany).not.toHaveBeenCalled();
    expect(tx.growthAttributeMapping.createMany).not.toHaveBeenCalled();
  });

  it('rejects foreign or unavailable attribute IDs before replacing existing mappings', async () => {
    const { tx, transaction } = createTransaction();
    tx.growthSkill.findMany.mockResolvedValueOnce([]);
    const repository = new PrismaSyncRepository({ $transaction: transaction } as never, {} as never);

    await expect(
      repository.applyMutations('user-1', 'device-1', [
        baseMutation({
          skillId: 'skill-1',
          mappings: [{ attributeId: 'foreign-attribute', slot: 'PRIMARY', weight: 100 }],
        }),
      ]),
    ).rejects.toMatchObject({ code: 'INVALID_SYNC_MUTATION' });
    expect(tx.growthAttributeMapping.deleteMany).not.toHaveBeenCalled();
    expect(tx.growthAttributeMapping.createMany).not.toHaveBeenCalled();
  });

  it('treats a retried mutation as idempotent and rejects payload reuse', async () => {
    const mutation = baseMutation({
      skillId: 'skill-1',
      mappings: [{ attributeId: 'attribute-1', slot: 'PRIMARY', weight: 100 }],
    });
    const { tx, transaction } = createTransaction();
    tx.syncMutation.findUnique.mockResolvedValue({
      id: mutation.id,
      userId: 'user-1',
      kind: mutation.kind,
      entityId: mutation.entityId,
      payload: mutation.payload,
      result: null,
    });
    const repository = new PrismaSyncRepository({ $transaction: transaction } as never, {} as never);

    await expect(repository.applyMutations('user-1', 'device-1', [mutation])).resolves.toMatchObject({
      acknowledgedMutationIds: [mutation.id],
    });
    expect(tx.growthAttributeMapping.deleteMany).not.toHaveBeenCalled();

    tx.syncMutation.findUnique.mockResolvedValue({
      id: mutation.id,
      userId: 'user-1',
      kind: mutation.kind,
      entityId: mutation.entityId,
      payload: { ...mutation.payload, mappings: [{ attributeId: 'attribute-2', slot: 'PRIMARY', weight: 100 }] },
      result: null,
    });
    await expect(repository.applyMutations('user-1', 'device-1', [mutation])).rejects.toMatchObject({
      details: { reason: 'MUTATION_ID_REUSED', mutationId: mutation.id },
    });
  });

  it('includes existing mappings as one grouped record in a cursor-zero snapshot', async () => {
    const mappings = [
      { id: 'mapping-1', skillId: 'skill-1', attributeId: 'attribute-1', slot: 'PRIMARY', weight: 70 },
      { id: 'mapping-2', skillId: 'skill-1', attributeId: 'attribute-2', slot: 'SECONDARY', weight: 30 },
    ];
    const prisma = new Proxy(
      {} as Record<string, unknown>,
      {
        get: (_target, property: string) =>
          property === 'growthAttributeMapping'
            ? { findMany: jest.fn().mockResolvedValue(mappings) }
            : { findMany: jest.fn().mockResolvedValue([]) },
      },
    );
    const repository = new PrismaSyncRepository(prisma as never, {} as never);

    const snapshot = await (
      repository as unknown as { initialSnapshot: (userId: string) => Promise<Array<Record<string, unknown>>> }
    ).initialSnapshot('user-1');
    const mappingChanges = snapshot.filter((change) => change.entityType === 'growthattributemapping');

    expect(mappingChanges).toEqual([
      expect.objectContaining({ entityId: 'skill-1', data: mappings }),
    ]);
  });

  it('keeps user action notes while excluding only reserved habit idempotency markers', async () => {
    const userNote = { id: 'log-user', note: 'action:my workout', source: 'MANUAL', adjusted: false, rewardEligible: true };
    const marker = { id: 'log-marker', note: `${HABIT_ACTION_MARKER_PREFIX}undo`, source: 'MANUAL', adjusted: true, rewardEligible: false };
    const prisma = new Proxy(
      {} as Record<string, unknown>,
      {
        get: (_target, property: string) =>
          property === 'habitProgressLog'
            ? { findMany: jest.fn().mockImplementation((args: { where?: { NOT?: unknown } }) => Promise.resolve(args.where?.NOT ? [userNote] : [userNote, marker])) }
            : { findMany: jest.fn().mockResolvedValue([]) },
      },
    );
    const repository = new PrismaSyncRepository(prisma as never, {} as never);

    const snapshot = await (
      repository as unknown as { initialSnapshot: (userId: string) => Promise<Array<Record<string, unknown>>> }
    ).initialSnapshot('user-1');

    expect(snapshot.filter((change) => change.entityType === 'habitprogresslog').map((change) => change.data)).toEqual([userNote]);
  });
});
