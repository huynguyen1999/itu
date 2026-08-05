import { GrowthCurrency, GrowthLedgerKind, GrowthScalingMode, GrowthSourceType, Prisma } from '@prisma/client';
import {
  awardGrowthActivity,
  awardGrowthActivityWithReceipt,
  reverseGrowthActivity,
  reverseGrowthActivityWithReceipt,
} from './growth-awards';

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    growthProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    growthEarningRule: {
      findUnique: jest.fn().mockResolvedValue({
        enabled: true,
        coinReward: 4,
        accountXp: 12,
        skillAwards: [{ skillId: 'skill-1', xpReward: 12, skill: { name: 'Fitness', archivedAt: null } }],
      }),
    },
    growthLedgerEntry: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'ledger-created' }),
    },
    growthInventoryTransaction: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'inventory-created' }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
    },
    syncChange: { create: jest.fn().mockResolvedValue({}) },
    ...overrides,
  } as unknown as Prisma.TransactionClient;
}

describe('Growth activity ledger', () => {
  function ruleWithSkills(
    skillAwards: Array<{ skillId: string; xpReward: number; archivedAt?: Date | null }>,
    accountXp?: number,
  ) {
    return {
      enabled: true,
      coinReward: 0,
      accountXp: accountXp ?? Math.max(...skillAwards.map((award) => award.xpReward), 0),
      scalingMode: GrowthScalingMode.FIXED,
      maxRewardCap: null,
      skillAwards: skillAwards.map((award) => ({
        skillId: award.skillId,
        xpReward: award.xpReward,
        skill: {
          id: award.skillId,
          name: award.skillId,
          kind: 'SKILL',
          icon: 'SPARKLES',
          color: 'TEAL',
          baseXp: 100,
          archivedAt: award.archivedAt ?? null,
        },
      })),
      itemAwards: [],
    };
  }

  function accountAndSkillAmounts(tx: Prisma.TransactionClient) {
    const calls = (tx.growthLedgerEntry.createMany as jest.Mock).mock.calls;
    return {
      account: calls.find((call) => call[0].data[0].currency === GrowthCurrency.ACCOUNT_XP)?.[0].data[0].amount,
      skills: calls
        .filter((call) => call[0].data[0].currency === GrowthCurrency.SKILL_XP)
        .map((call) => call[0].data[0].amount),
    };
  }

  it.each([
    [4, 0],
    [5, 1],
    [75, 15],
    [100, 15],
  ])('bounds focus Account XP at one per five valid minutes (%i -> %i)', async (durationMinutes, expected) => {
    const tx = transaction({
      growthEarningRule: {
        findUnique: jest.fn().mockResolvedValue(ruleWithSkills([{ skillId: 'skill-1', xpReward: 50 }], 999)),
      },
    });

    await awardGrowthActivity(
      tx,
      'user-1',
      GrowthSourceType.FOCUS_PRESET,
      'preset-1',
      'Focus',
      {},
      'session-1',
      { durationMinutes },
    );

    expect(accountAndSkillAmounts(tx).account ?? 0).toBe(expected);
  });

  it.each([
    [1, 0],
    [2, 1],
    [41, 20],
  ])('bounds study Account XP at one per two reviewed cards (%i -> %i)', async (reviewedCount, expected) => {
    const tx = transaction({
      growthEarningRule: {
        findUnique: jest.fn().mockResolvedValue({
          ...ruleWithSkills([{ skillId: 'skill-1', xpReward: 10 }], 999),
          scalingMode: GrowthScalingMode.LINEAR,
          maxRewardCap: 7,
          coinReward: 3,
        }),
      },
    });

    await awardGrowthActivity(
      tx,
      'user-1',
      GrowthSourceType.REVIEW_DECK,
      'deck-1',
      'Study',
      { correctCount: 0 },
      'session-1',
      { reviewedCount },
    );

    expect(accountAndSkillAmounts(tx).account ?? 0).toBe(expected);
    if (reviewedCount === 41) {
      const coin = (tx.growthLedgerEntry.createMany as jest.Mock).mock.calls.find(
        (call) => call[0].data[0].currency === GrowthCurrency.COIN,
      )?.[0].data[0].amount;
      expect(coin).toBe(7);
    }
  });

  it('keeps Account XP fixed when additional skills are selected', async () => {
    const base = ruleWithSkills([{ skillId: 'skill-1', xpReward: 20 }]);
    const extra = ruleWithSkills([
      { skillId: 'skill-1', xpReward: 20 },
      { skillId: 'skill-2', xpReward: 20 },
      { skillId: 'skill-3', xpReward: 20 },
      { skillId: 'skill-4', xpReward: 20 },
    ]);
    const firstTx = transaction({ growthEarningRule: { findUnique: jest.fn().mockResolvedValue(base) } });
    const secondTx = transaction({ growthEarningRule: { findUnique: jest.fn().mockResolvedValue(extra) } });

    await awardGrowthActivity(firstTx, 'user-1', GrowthSourceType.TASK, 'task-1', 'Run');
    await awardGrowthActivity(secondTx, 'user-1', GrowthSourceType.TASK, 'task-2', 'Run');

    expect(accountAndSkillAmounts(firstTx).account).toBe(20);
    expect(accountAndSkillAmounts(secondTx).account).toBe(20);
  });

  it('allocates no more than three skills and sums allocations to the fixed budget', async () => {
    const tx = transaction({
      growthEarningRule: {
        findUnique: jest.fn().mockResolvedValue(
          ruleWithSkills([
            { skillId: 'skill-1', xpReward: 10 },
            { skillId: 'skill-2', xpReward: 20 },
            { skillId: 'skill-3', xpReward: 30 },
            { skillId: 'skill-4', xpReward: 40 },
          ]),
        ),
      },
    });

    await awardGrowthActivity(tx, 'user-1', GrowthSourceType.TASK, 'task-1', 'Run');

    const amounts = accountAndSkillAmounts(tx);
    expect(amounts.account).toBe(40);
    expect(amounts.skills).toHaveLength(3);
    expect(amounts.skills.reduce((sum, amount) => sum + amount, 0)).toBe(amounts.account);
  });

  it('splits a 10 Account XP budget 70/30 with exact integer allocations', async () => {
    const tx = transaction({
      growthEarningRule: {
        findUnique: jest.fn().mockResolvedValue(
          ruleWithSkills([
            { skillId: 'skill-1', xpReward: 7 },
            { skillId: 'skill-2', xpReward: 3 },
          ], 10),
        ),
      },
    });

    await awardGrowthActivity(tx, 'user-1', GrowthSourceType.TASK, 'task-70-30', 'Run');

    expect(accountAndSkillAmounts(tx)).toEqual({ account: 10, skills: [7, 3] });
  });

  it('uses stable largest-remainder allocation for a 10 Account XP 60/25/15 split', async () => {
    const tx = transaction({
      growthEarningRule: {
        findUnique: jest.fn().mockResolvedValue(
          ruleWithSkills([
            { skillId: 'skill-1', xpReward: 60 },
            { skillId: 'skill-2', xpReward: 25 },
            { skillId: 'skill-3', xpReward: 15 },
          ], 10),
        ),
      },
    });

    await awardGrowthActivity(tx, 'user-1', GrowthSourceType.TASK, 'task-60-25-15', 'Run');

    expect(accountAndSkillAmounts(tx)).toEqual({ account: 10, skills: [6, 3, 1] });
  });

  it('keeps the account budget when a contributing skill is archived', async () => {
    const tx = transaction({
      growthEarningRule: {
        findUnique: jest.fn().mockResolvedValue(
          ruleWithSkills([
            { skillId: 'skill-1', xpReward: 20 },
            { skillId: 'skill-2', xpReward: 40, archivedAt: new Date() },
          ]),
        ),
      },
    });

    await awardGrowthActivity(tx, 'user-1', GrowthSourceType.TASK, 'task-1', 'Run');

    const amounts = accountAndSkillAmounts(tx);
    expect(amounts.account).toBe(40);
    expect(amounts.skills).toEqual([40]);
  });

  it('writes separate immutable skill XP and coin awards with stable keys', async () => {
    const tx = transaction();

    await expect(awardGrowthActivity(tx, 'user-1', GrowthSourceType.TASK, 'task-1', 'Run 5 km')).resolves.toBe(true);

    expect(tx.growthLedgerEntry.createMany).toHaveBeenCalledTimes(3);
    expect(tx.growthLedgerEntry.createMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: [
          expect.objectContaining({
            currency: GrowthCurrency.SKILL_XP,
            amount: 12,
            entryKey: 'award:TASK:task-1:skill:skill-1',
          }),
        ],
        skipDuplicates: true,
      }),
    );
    expect(tx.growthLedgerEntry.createMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: [
          expect.objectContaining({
            currency: GrowthCurrency.ACCOUNT_XP,
            amount: 12,
            entryKey: 'award:TASK:task-1:account',
          }),
        ],
        skipDuplicates: true,
      }),
    );
    expect(tx.growthLedgerEntry.createMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        data: [
          expect.objectContaining({
            currency: GrowthCurrency.COIN,
            amount: 4,
            entryKey: 'award:TASK:task-1:coin',
          }),
        ],
      }),
    );
  });

  it('appends a compensating reversal rather than editing the original award', async () => {
    const award = {
      id: 'ledger-1',
      userId: 'user-1',
      currency: GrowthCurrency.SKILL_XP,
      skillId: 'skill-1',
      amount: 12,
      kind: GrowthLedgerKind.ACTIVITY_AWARD,
      sourceType: 'TASK',
      sourceId: 'task-1',
    };
    const tx = transaction({
      growthLedgerEntry: {
        findMany: jest.fn().mockResolvedValue([award]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'ledger-reversal' }),
      },
    });

    await expect(reverseGrowthActivity(tx, 'user-1', GrowthSourceType.TASK, 'task-1', 'Run 5 km')).resolves.toBe(true);

    expect(tx.growthLedgerEntry.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            amount: -12,
            kind: GrowthLedgerKind.REVERSAL,
            reversalOfId: 'ledger-1',
            entryKey: 'reverse:ledger-1',
          }),
        ],
      }),
    );
  });

  it('reverses Account XP and Skill XP as separate immutable entries', async () => {
    const awards = [
      {
        id: 'skill-award',
        userId: 'user-1',
        currency: GrowthCurrency.SKILL_XP,
        skillId: 'skill-1',
        amount: 7,
        kind: GrowthLedgerKind.ACTIVITY_AWARD,
        sourceType: 'TASK',
        sourceId: 'task-1',
        cycleId: 'cycle-1',
      },
      {
        id: 'account-award',
        userId: 'user-1',
        currency: GrowthCurrency.ACCOUNT_XP,
        skillId: null,
        amount: 10,
        kind: GrowthLedgerKind.ACTIVITY_AWARD,
        sourceType: 'TASK',
        sourceId: 'task-1',
        cycleId: 'cycle-1',
      },
    ];
    const tx = transaction({
      growthLedgerEntry: {
        findMany: jest.fn().mockResolvedValue(awards),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'reversal' }),
      },
    });

    await expect(reverseGrowthActivity(tx, 'user-1', GrowthSourceType.TASK, 'task-1', 'Run')).resolves.toBe(true);

    const reversalAmounts = (tx.growthLedgerEntry.createMany as jest.Mock).mock.calls.map((call) => call[0].data[0]);
    expect(reversalAmounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currency: GrowthCurrency.SKILL_XP, amount: -7, reversalOfId: 'skill-award' }),
        expect.objectContaining({ currency: GrowthCurrency.ACCOUNT_XP, amount: -10, reversalOfId: 'account-award' }),
      ]),
    );
  });

  it('appends compensating inventory transactions when reversing task item awards', async () => {
    const inventoryAward = {
      id: 'inventory-1',
      userId: 'user-1',
      itemId: 'item-1',
      quantity: 2,
      kind: 'TASK_AWARD',
      sourceType: 'TASK',
      sourceId: 'task-1',
    };
    const tx = transaction({
      growthInventoryTransaction: {
        findMany: jest.fn().mockResolvedValue([inventoryAward]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'inventory-reversal' }),
      },
    });

    await expect(reverseGrowthActivity(tx, 'user-1', GrowthSourceType.TASK, 'task-1', 'Run 5 km')).resolves.toBe(true);

    expect(tx.growthInventoryTransaction.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            itemId: 'item-1',
            quantity: -2,
            kind: 'REVERSAL',
            entryKey: 'inventory:reverse:inventory-1',
          }),
        ],
        skipDuplicates: true,
      }),
    );
    expect(tx.syncChange.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: 'growthinventorytransaction',
          entityId: 'inventory-reversal',
        }),
      }),
    );
  });

  it('reverses non-task item awards as well', async () => {
    const inventoryAward = {
      id: 'inventory-1',
      userId: 'user-1',
      itemId: 'item-1',
      quantity: 2,
      kind: 'ADJUSTMENT',
      sourceType: 'HABIT',
      sourceId: 'occurrence-1',
    };
    const tx = transaction({
      growthInventoryTransaction: {
        findMany: jest.fn().mockResolvedValue([inventoryAward]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'inventory-reversal' }),
      },
    });

    await expect(
      reverseGrowthActivity(tx, 'user-1', GrowthSourceType.HABIT, 'occurrence-1', 'Read'),
    ).resolves.toBe(true);

    expect(tx.growthInventoryTransaction.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ quantity: -2, entryKey: 'inventory:reverse:inventory-1' })],
      }),
    );
  });

  it('returns the item-only reversal lifecycle receipt key', async () => {
    const inventoryAward = {
      id: 'inventory-1',
      userId: 'user-1',
      itemId: 'item-1',
      quantity: 2,
      kind: 'ADJUSTMENT',
      sourceType: 'HABIT',
      sourceId: 'occurrence-1',
      entryKey: 'inventory:award:HABIT:occurrence-1:lc1:item:item-1',
    };
    const tx = transaction({
      growthInventoryTransaction: {
        findMany: jest.fn().mockResolvedValue([inventoryAward]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'inventory-reversal' }),
      },
    });

    await expect(
      reverseGrowthActivityWithReceipt(tx, 'user-1', GrowthSourceType.HABIT, 'occurrence-1', 'Read'),
    ).resolves.toEqual(expect.objectContaining({
      reversed: true,
      receiptKey: 'reverted:HABIT:occurrence-1:lc1',
    }));
  });

  it('advances the lifecycle for item-only awards after reversal', async () => {
    const inventoryRows: Array<Record<string, unknown>> = [];
    const tx = transaction({
      growthEarningRule: {
        findUnique: jest.fn().mockResolvedValue({
          enabled: true,
          coinReward: 0,
          accountXp: 0,
          scalingMode: GrowthScalingMode.FIXED,
          maxRewardCap: null,
          skillAwards: [],
          itemAwards: [{ itemId: 'item-1', quantity: 1, item: { id: 'item-1', name: 'Token', archivedAt: null } }],
        }),
      },
      growthInventoryTransaction: {
        findMany: jest.fn().mockImplementation(async (query: { where?: { kind?: unknown } }) =>
          query?.where?.kind ? inventoryRows.filter((row) => typeof row.quantity === 'number' && row.quantity > 0) : [...inventoryRows]),
        createMany: jest.fn().mockImplementation(async ({ data }: { data: Array<Record<string, unknown>> }) => {
          const row = data[0];
          if (inventoryRows.some((existing) => existing.entryKey === row.entryKey)) return { count: 0 };
          inventoryRows.push(row);
          return { count: 1 };
        }),
        findUniqueOrThrow: jest.fn().mockImplementation(async ({ where }: { where: { userId_entryKey: { entryKey: string } } }) =>
          inventoryRows.find((row) => row.entryKey === where.userId_entryKey.entryKey) ?? { id: 'missing' }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 1 } }),
      },
    });

    await expect(awardGrowthActivity(tx, 'user-1', GrowthSourceType.HABIT, 'habit-1', 'Read')).resolves.toBe(true);
    await expect(reverseGrowthActivity(tx, 'user-1', GrowthSourceType.HABIT, 'habit-1', 'Read')).resolves.toBe(true);
    await expect(
      awardGrowthActivityWithReceipt(tx, 'user-1', GrowthSourceType.HABIT, 'habit-1', 'Read'),
    ).resolves.toEqual(expect.objectContaining({ receiptKey: 'earned:HABIT:habit-1:lc1' }));

    expect(inventoryRows[0].entryKey).toBe('inventory:award:HABIT:habit-1:item:item-1');
    expect(inventoryRows[1].entryKey).toBe(`inventory:reverse:${inventoryRows[0].id}`);
    expect(inventoryRows[2].entryKey).toBe('inventory:award:HABIT:habit-1:lc1:item:item-1');
  });

  it('does not award a source without an enabled rule', async () => {
    const tx = transaction({
      growthEarningRule: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await expect(awardGrowthActivity(tx, 'user-1', GrowthSourceType.HABIT, 'habit-1', 'Read')).resolves.toBe(false);
    expect(tx.growthLedgerEntry.createMany).not.toHaveBeenCalled();
  });

  it('is idempotent for a lifecycle while retaining a single Account XP entry', async () => {
    const seen = new Set<string>();
    const tx = transaction({
      growthLedgerEntry: {
        count: jest.fn().mockResolvedValue(0),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'ledger-created' }),
        createMany: jest.fn().mockImplementation(({ data }: { data: Array<{ entryKey: string }> }) => {
          const key = data[0].entryKey;
          if (seen.has(key)) return { count: 0 };
          seen.add(key);
          return { count: 1 };
        }),
      },
    });

    await expect(awardGrowthActivity(tx, 'user-1', GrowthSourceType.TASK, 'task-1', 'Run')).resolves.toBe(true);
    await expect(awardGrowthActivity(tx, 'user-1', GrowthSourceType.TASK, 'task-1', 'Run')).resolves.toBe(false);

    const accountCalls = (tx.growthLedgerEntry.createMany as jest.Mock).mock.calls.filter(
      (call) => call[0].data[0].currency === GrowthCurrency.ACCOUNT_XP,
    );
    expect(accountCalls).toHaveLength(2);
    expect(accountCalls.map((call) => call[0].data[0].entryKey)).toEqual([
      'award:TASK:task-1:account',
      'award:TASK:task-1:account',
    ]);
  });

  it('returns the server-calculated progress, coin, and item receipt', async () => {
    const tx = transaction({
      growthProfile: {
        findUnique: jest.fn().mockResolvedValue({ activeCycleId: 'cycle-1' }),
      },
      growthEarningRule: {
        findUnique: jest.fn().mockResolvedValue({
          enabled: true,
          coinReward: 4,
          accountXp: 12,
          scalingMode: 'FIXED',
          maxRewardCap: null,
          skillAwards: [
            {
              skillId: 'skill-1',
              xpReward: 12,
              skill: {
                id: 'skill-1',
                name: 'Fitness',
                kind: 'SKILL',
                icon: 'DUMBBELL',
                color: 'EMERALD',
                baseXp: 100,
                archivedAt: null,
              },
            },
          ],
          itemAwards: [
            {
              itemId: 'item-1',
              quantity: 2,
              item: {
                id: 'item-1',
                name: 'Recovery drink',
                icon: 'GIFT',
                color: 'VIOLET',
                archivedAt: null,
              },
            },
          ],
        }),
      },
      growthLedgerEntry: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { amount: 95 } })
          .mockResolvedValueOnce({ _sum: { amount: 6 } })
          .mockResolvedValueOnce({ _sum: { amount: 6 } }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'ledger-created' }),
      },
      growthInventoryTransaction: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'inventory-created' }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 3 } }),
      },
    });

    await expect(
      awardGrowthActivityWithReceipt(tx, 'user-1', GrowthSourceType.TASK, 'task-1', 'Run 5 km'),
    ).resolves.toEqual(
      expect.objectContaining({
        title: 'Run 5 km',
        receiptKey: 'earned:TASK:task-1:lc0',
        progressAwards: [
          expect.objectContaining({
            name: 'Fitness',
            xpGained: 12,
            beforeXp: 95,
            afterXp: 107,
            beforeLevel: 1,
            afterLevel: 2,
          }),
        ],
        accountAward: expect.objectContaining({ amount: 12, beforeXp: 6, afterXp: 18 }),
        coinAward: { amount: 4, balanceAfter: 10 },
        itemAwards: [
          expect.objectContaining({
            name: 'Recovery drink',
            quantity: 2,
            inventoryQuantityAfter: 3,
          }),
        ],
      }),
    );
  });

  it.each([
    [8, 80, 20, 6, 2],
    [7, 70, 30, 5, 2],
  ])('derives Attribute XP with largest-remainder rounding (%i at %i/%i)', async (amount, primaryWeight, secondaryWeight, primaryXp, secondaryXp) => {
    const tx = transaction({
      growthEarningRule: {
        findUnique: jest.fn().mockResolvedValue({
          ...ruleWithSkills([{ skillId: 'skill-1', xpReward: amount }], amount),
          skillAwards: [{
            skillId: 'skill-1', xpReward: amount,
            skill: { id: 'skill-1', name: 'Programming', kind: 'SKILL', icon: 'CODE', color: 'TEAL', baseXp: 100, archivedAt: null },
          }],
        }),
      },
      growthAttributeMapping: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'map-primary', skillId: 'skill-1', attributeId: 'attr-1', slot: 'PRIMARY', weight: primaryWeight, attribute: { id: 'attr-1', name: 'Intelligence', kind: 'ATTRIBUTE', icon: 'BRAIN', color: 'VIOLET', baseXp: 100, archivedAt: null } },
          { id: 'map-secondary', skillId: 'skill-1', attributeId: 'attr-2', slot: 'SECONDARY', weight: secondaryWeight, attribute: { id: 'attr-2', name: 'Creativity', kind: 'ATTRIBUTE', icon: 'LIGHTBULB', color: 'AMBER', baseXp: 100, archivedAt: null } },
        ]),
      },
    });

    await awardGrowthActivity(tx, 'user-1', GrowthSourceType.TASK, `task-${amount}`, 'Practice');

    const skillEntries = (tx.growthLedgerEntry.createMany as jest.Mock).mock.calls
      .map((call) => call[0].data[0])
      .filter((entry) => entry.currency === GrowthCurrency.SKILL_XP);
    expect(skillEntries.map((entry) => entry.amount)).toEqual([amount, primaryXp, secondaryXp]);
    expect(skillEntries[1].metadata.mappingSnapshot).toEqual(expect.arrayContaining([
      expect.objectContaining({ mappingId: 'map-primary', attributeId: 'attr-1', weight: primaryWeight }),
      expect.objectContaining({ mappingId: 'map-secondary', attributeId: 'attr-2', weight: secondaryWeight }),
    ]));
  });

  it('reports attribute receipt before/after XP without counting the inserted derived row as before XP', async () => {
    const rows: Array<Record<string, unknown>> = [
      { userId: 'user-1', currency: GrowthCurrency.SKILL_XP, skillId: 'skill-1', amount: 5 },
      { userId: 'user-1', currency: GrowthCurrency.SKILL_XP, skillId: 'attr-1', amount: 10 },
      { userId: 'user-1', currency: GrowthCurrency.ACCOUNT_XP, skillId: null, amount: 4 },
    ];
    const createMany = jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
      rows.push(...data);
      return { count: data.length };
    });
    const aggregate = jest.fn(async ({ where }: { where: Record<string, unknown> }) => ({
      _sum: {
        amount: rows
          .filter((row) => row.userId === where.userId && row.currency === where.currency)
          .filter((row) => where.skillId === undefined || row.skillId === where.skillId)
          .reduce((sum, row) => sum + Number(row.amount), 0),
      },
    }));
    const tx = transaction({
      growthEarningRule: {
        findUnique: jest.fn().mockResolvedValue({
          ...ruleWithSkills([{ skillId: 'skill-1', xpReward: 8 }], 8),
          skillAwards: [{
            skillId: 'skill-1', xpReward: 8,
            skill: { id: 'skill-1', name: 'Programming', kind: 'SKILL', icon: 'CODE', color: 'TEAL', baseXp: 100, archivedAt: null },
          }],
        }),
      },
      growthLedgerEntry: {
        createMany,
        aggregate,
        count: jest.fn().mockResolvedValue(0),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'ledger-created' }),
      },
      growthAttributeMapping: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'map-primary', skillId: 'skill-1', attributeId: 'attr-1', slot: 'PRIMARY', weight: 80, attribute: { id: 'attr-1', name: 'Intelligence', kind: 'ATTRIBUTE', icon: 'BRAIN', color: 'VIOLET', baseXp: 100, archivedAt: null } },
          { id: 'map-secondary', skillId: 'skill-1', attributeId: 'attr-2', slot: 'SECONDARY', weight: 20, attribute: { id: 'attr-2', name: 'Creativity', kind: 'ATTRIBUTE', icon: 'LIGHTBULB', color: 'AMBER', baseXp: 100, archivedAt: null } },
        ]),
      },
    });

    const receipt = await awardGrowthActivityWithReceipt(tx, 'user-1', GrowthSourceType.TASK, 'task-receipt', 'Practice');

    expect(receipt?.progressAwards).toEqual(expect.arrayContaining([
      expect.objectContaining({ progressId: 'skill-1', beforeXp: 5, afterXp: 13, xpGained: 8 }),
      expect.objectContaining({
        progressId: 'attr-1',
        beforeXp: 10,
        afterXp: 16,
        xpGained: 6,
        awardType: 'ATTRIBUTE',
        derivedFromSkillId: 'skill-1',
        mappingSnapshot: expect.arrayContaining([
          expect.objectContaining({ mappingId: 'map-primary', attributeId: 'attr-1', weight: 80 }),
          expect.objectContaining({ mappingId: 'map-secondary', attributeId: 'attr-2', weight: 20 }),
        ]),
      }),
      expect.objectContaining({
        progressId: 'attr-2',
        beforeXp: 0,
        afterXp: 2,
        xpGained: 2,
        awardType: 'ATTRIBUTE',
        derivedFromSkillId: 'skill-1',
      }),
    ]));
  });

  it('leaves direct Attribute XP receipts without derivation metadata', async () => {
    const tx = transaction({
      growthEarningRule: {
        findUnique: jest.fn().mockResolvedValue({
          ...ruleWithSkills([{ skillId: 'attribute-1', xpReward: 5 }], 5),
          skillAwards: [{
            skillId: 'attribute-1',
            xpReward: 5,
            skill: {
              id: 'attribute-1',
              name: 'Intelligence',
              kind: 'ATTRIBUTE',
              icon: 'BRAIN',
              color: 'VIOLET',
              baseXp: 100,
              archivedAt: null,
            },
          }],
        }),
      },
      growthLedgerEntry: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 10 } }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'ledger-created' }),
      },
    });

    const receipt = await awardGrowthActivityWithReceipt(tx, 'user-1', GrowthSourceType.TASK, 'task-direct', 'Practice');
    const award = receipt?.progressAwards[0];

    expect(award).toMatchObject({ progressId: 'attribute-1', awardType: 'ATTRIBUTE', xpGained: 5 });
    expect(award).not.toHaveProperty('derivedFromSkillId');
    expect(award).not.toHaveProperty('mappingSnapshot');
  });
});
