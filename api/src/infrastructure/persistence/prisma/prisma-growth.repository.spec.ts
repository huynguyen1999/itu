import { GrowthProgressKind } from '@prisma/client';
import { PrismaGrowthRepository } from './prisma-growth.repository';

describe('PrismaGrowthRepository', () => {
  describe('overview', () => {
    it('aggregates account progress from Account XP entries only', async () => {
      const db = {
        growthSkill: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'skill-1',
              kind: GrowthProgressKind.SKILL,
              name: 'Focus',
              icon: 'FOCUS',
              color: 'TEAL',
              baseXp: 100,
              ledgerEntries: [{ amount: 80 }],
            },
          ]),
        },
        growthLedgerEntry: {
          aggregate: jest.fn(({ where }: { where: { currency: string } }) => {
            if (where.currency === 'ACCOUNT_XP') return Promise.resolve({ _sum: { amount: 37 } });
            return Promise.resolve({ _sum: { amount: 9 } });
          }),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const repository = new PrismaGrowthRepository(db as never, {} as never);
      jest.spyOn(repository, 'getOrCreateProfile').mockResolvedValue({
        activeCycleId: 'cycle-1',
        accountBaseXp: 75,
      } as never);

      const result = await repository.overview('user-1');

      expect(result.account.currentXp).toBe(37);
      expect(result.account.coinBalance).toBe(9);
      expect(db.growthLedgerEntry.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', currency: 'ACCOUNT_XP' } }),
      );
    });

    it('reflects award reversals in the account XP bar instead of gross lifetime earnings', async () => {
      const db = {
        growthSkill: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        growthLedgerEntry: {
          aggregate: jest.fn(({ where }: { where: { currency?: string; kind?: string; amount?: unknown } }) => {
            if (where.currency === 'ACCOUNT_XP' && where.kind === 'ACTIVITY_AWARD') {
              // Gross positive awards: 37 XP earned across lifecycles.
              return Promise.resolve({ _sum: { amount: 37 } });
            }
            if (where.currency === 'ACCOUNT_XP') {
              // Net balance after a 10 XP award was reversed by an undo.
              return Promise.resolve({ _sum: { amount: 27 } });
            }
            return Promise.resolve({ _sum: { amount: 9 } });
          }),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const repository = new PrismaGrowthRepository(db as never, {} as never);
      jest.spyOn(repository, 'getOrCreateProfile').mockResolvedValue({
        activeCycleId: 'cycle-1',
        accountBaseXp: 75,
        lifetimeEarnedXp: 37,
        outstandingPenaltyDebt: 0,
        protectedLevelFloor: 1,
        highestLevelReached: 1,
      } as never);

      const result = await repository.overview('user-1');

      expect(result.account.currentXp).toBe(27);
      expect(result.account.lifetimeEarnedXp).toBe(37);
    });

    it('does not use the commitment level floor to hide an activity undo', async () => {
      const db = {
        growthSkill: { findMany: jest.fn().mockResolvedValue([]) },
        growthLedgerEntry: {
          aggregate: jest.fn(({ where }: { where: { currency?: string; kind?: string } }) => {
            if (where.currency === 'ACCOUNT_XP' && where.kind === 'ACTIVITY_AWARD') {
              return Promise.resolve({ _sum: { amount: 1_600 } });
            }
            if (where.currency === 'ACCOUNT_XP') return Promise.resolve({ _sum: { amount: 1_566 } });
            return Promise.resolve({ _sum: { amount: 0 } });
          }),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const repository = new PrismaGrowthRepository(db as never, {} as never);
      jest.spyOn(repository, 'getOrCreateProfile').mockResolvedValue({
        activeCycleId: 'cycle-1',
        accountBaseXp: 100,
        lifetimeEarnedXp: 1_600,
        outstandingPenaltyDebt: 0,
        protectedLevelFloor: 5,
        highestLevelReached: 5,
      } as never);

      const result = await repository.overview('user-1');

      expect(result.account.currentXp).toBe(1_566);
    });
  });

  describe('listSkills', () => {
    it('returns skills enriched with ledger-derived XP and level progression', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          id: 'attr-1',
          kind: GrowthProgressKind.ATTRIBUTE,
          name: 'Focus',
          icon: 'FOCUS',
          color: 'TEAL',
          baseXp: 100,
          ledgerEntries: [{ amount: 450 }],
        },
        {
          id: 'attr-2',
          kind: GrowthProgressKind.ATTRIBUTE,
          name: 'Grit',
          icon: 'GRIT',
          color: 'AMBER',
          baseXp: 100,
          ledgerEntries: [{ amount: 0 }],
        },
      ]);
      const db = {
        growthProfile: {
          findUnique: jest.fn().mockResolvedValue({ id: 'profile-1', activeCycleId: 'cycle-1' }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'profile-1', activeCycleId: 'cycle-1' }),
        },
        growthSkill: { findMany },
        $transaction: jest.fn().mockResolvedValue(undefined),
      };
      const repository = new PrismaGrowthRepository(db as never, {} as never);

      const result = await repository.listSkills('user-1', false, GrowthProgressKind.ATTRIBUTE);

      expect(result[0]).toMatchObject({
        id: 'attr-1',
        currentXp: 450,
        level: 3,
        nextLevelXp: 900,
        progressXp: 50,
        requiredXp: 500,
        baseXp: 100,
      });
      expect(result[1]).toMatchObject({
        id: 'attr-2',
        currentXp: 0,
        level: 1,
        nextLevelXp: 100,
        progressXp: 0,
        requiredXp: 100,
        baseXp: 100,
      });
      // Raw ledger entries must not leak into the response payload.
      expect(result[0]).not.toHaveProperty('ledgerEntries');
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ kind: GrowthProgressKind.ATTRIBUTE }),
          include: {
            ledgerEntries: expect.objectContaining({
              where: { cycleId: 'cycle-1', currency: 'SKILL_XP' },
            }),
          },
        }),
      );
    });
  });

  describe('attribute mapping sync broadcast', () => {
    it('records one grouped change for a direct REST replacement', async () => {
      const full = [
        { id: 'mapping-1', skillId: 'skill-1', attributeId: 'attribute-1', slot: 'PRIMARY', weight: 100 },
      ];
      const tx = {
        growthSkill: {
          findFirst: jest.fn().mockResolvedValue({ id: 'skill-1', kind: GrowthProgressKind.SKILL, archivedAt: null }),
          findMany: jest.fn().mockResolvedValue([{ id: 'attribute-1' }]),
        },
        growthAttributeMapping: {
          deleteMany: jest.fn().mockResolvedValue(undefined),
          createMany: jest.fn().mockResolvedValue(undefined),
          findMany: jest.fn().mockResolvedValue(full),
        },
        syncChange: { create: jest.fn().mockResolvedValue(undefined) },
      };
      const db = {
        $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      };
      const repository = new PrismaGrowthRepository(db as never, {} as never);

      await repository.upsertAttributeMappings('user-1', {
        skillId: 'skill-1',
        mappings: [{ attributeId: 'attribute-1', slot: 'PRIMARY', weight: 100 }],
      });

      expect(tx.syncChange.create).toHaveBeenCalledTimes(1);
      expect(tx.syncChange.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityType: 'growthattributemapping',
          entityId: 'skill-1',
          operation: 'UPSERT',
          data: full,
        }),
      });
    });
  });
});
