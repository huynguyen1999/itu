import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { applyOptimisticGrowthReceipt } from './growthReceiptCache';

describe('growth receipt cache projection', () => {
  it('updates and reverts cached Growth progress immediately', () => {
    const queryClient = new QueryClient();
    const strength = {
      id: 'skill-1',
      name: 'Strength',
      kind: 'ATTRIBUTE',
      currentXp: 90,
      level: 1,
      levelStartXp: 0,
      nextLevelXp: 100,
      progressXp: 90,
      requiredXp: 100,
      baseXp: 100,
    };
    queryClient.setQueryData(['growth', 'skills'], [strength]);
    queryClient.setQueryData(['growth', 'overview'], {
      account: { ...strength, id: undefined, currentXp: 90, coinBalance: 3 },
      skills: [strength],
      profile: {},
      recentLedger: [],
    });

    const receipt = {
      sourceType: 'TASK' as const,
      sourceId: 'task-1',
      title: 'Exercise',
      accountAward: {
        amount: 20,
        beforeXp: 90,
        afterXp: 110,
        beforeLevel: 1,
        afterLevel: 2,
        nextLevelXp: 400,
      },
      progressAwards: [
        {
          progressId: 'skill-1',
          name: 'Strength',
          kind: 'ATTRIBUTE' as const,
          icon: 'Dumbbell',
          color: 'TEAL',
          xpGained: 20,
          beforeXp: 90,
          afterXp: 110,
          beforeLevel: 1,
          afterLevel: 2,
          nextLevelXp: 400,
        },
      ],
      coinAward: { amount: 2, balanceAfter: 5 },
      itemAwards: [],
    };

    applyOptimisticGrowthReceipt(queryClient, receipt);
    expect(queryClient.getQueryData<Array<{ currentXp: number; level: number }>>(['growth', 'skills'])?.[0])
      .toMatchObject({ currentXp: 110, level: 2, progressXp: 10, nextLevelXp: 400 });
    expect(queryClient.getQueryData<{ account: { currentXp: number; coinBalance: number } }>(['growth', 'overview'])?.account)
      .toMatchObject({ currentXp: 110, level: 2, coinBalance: 5 });

    applyOptimisticGrowthReceipt(queryClient, { ...receipt, reverted: true });
    expect(queryClient.getQueryData<Array<{ currentXp: number; level: number }>>(['growth', 'skills'])?.[0])
      .toMatchObject({ currentXp: 90, level: 1, progressXp: 90, nextLevelXp: 100 });
    expect(queryClient.getQueryData<{ account: { currentXp: number; coinBalance: number } }>(['growth', 'overview'])?.account)
      .toMatchObject({ currentXp: 90, level: 1, coinBalance: 3 });
  });
});
