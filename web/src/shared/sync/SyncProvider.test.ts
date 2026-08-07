import { describe, expect, it } from 'vitest';
import type { GrowthAwardReceipt } from '../api/types';
import { growthCompletionTransition, mergeGrowthReceiptEntries } from './SyncProvider';

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

describe('growth receipt lifecycle reconciliation', () => {
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
});
