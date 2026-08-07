import { dehydrate, QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { GrowthEarningRule } from '../api/types';
import {
  applyOptimisticGrowthReceipt,
  applySyncChanges,
  invalidateSyncChanges,
  shouldDehydrateOfflineQuery,
} from './syncCache';

describe('applySyncChanges', () => {
  it('merges task changes into every cached task view', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['tasks', 'all'], [{ id: 'task-1', title: 'Before', version: 1 }]);
    queryClient.setQueryData(['tasks', 'today'], [{ id: 'task-1', title: 'Before', version: 1 }]);

    applySyncChanges(queryClient, {
      acknowledgedMutationIds: [],
      cursor: '5',
      conflicts: [],
      changes: [
        {
          entityType: 'task',
          entityId: 'task-1',
          deleted: false,
          data: { id: 'task-1', title: 'After', version: 2 },
        },
      ],
    });

    expect(queryClient.getQueryData(['tasks', 'all'])).toEqual([{ id: 'task-1', title: 'After', version: 2 }]);
    expect(queryClient.getQueryData(['tasks', 'today'])).toEqual([{ id: 'task-1', title: 'After', version: 2 }]);
  });

  it('inserts a new optimistic task Growth rule into matching rule queries only', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['growth', 'rules', 'TASK'], []);
    queryClient.setQueryData(['growth', 'rules', 'TASK', 'task-1'], []);
    queryClient.setQueryData(['growth', 'rules', 'HABIT'], []);
    queryClient.setQueryData(['growth', 'skills'], [{ id: 'skill-1', name: 'Strength' }]);
    const rule = {
      id: 'TASK:task-1',
      sourceType: 'TASK',
      sourceId: 'task-1',
      coinReward: 0,
      accountXp: 0,
      enabled: true,
      scalingMode: 'FIXED',
      version: 1,
      skillAwards: [],
      itemAwards: [],
    } satisfies GrowthEarningRule;

    applySyncChanges(queryClient, {
      acknowledgedMutationIds: [],
      cursor: '',
      conflicts: [],
      changes: [
        {
          entityType: 'growthearningrule',
          entityId: rule.id,
          deleted: false,
          data: rule,
        },
      ],
    });

    expect(queryClient.getQueryData(['growth', 'rules', 'TASK'])).toEqual([rule]);
    expect(queryClient.getQueryData(['growth', 'rules', 'TASK', 'task-1'])).toEqual([rule]);
    expect(queryClient.getQueryData(['growth', 'rules', 'HABIT'])).toEqual([]);
    expect(queryClient.getQueryData(['growth', 'skills'])).toEqual([{ id: 'skill-1', name: 'Strength' }]);
  });

  it('updates cached Growth attribute and account progress immediately from an offline receipt', () => {
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

    applyOptimisticGrowthReceipt(queryClient, {
      sourceType: 'TASK',
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
          kind: 'ATTRIBUTE',
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
    });

    expect(
      queryClient.getQueryData<Array<{ currentXp: number; level: number }>>(['growth', 'skills'])?.[0],
    ).toMatchObject({ currentXp: 110, level: 2, progressXp: 10, nextLevelXp: 400 });
    expect(
      queryClient.getQueryData<{ account: { currentXp: number; coinBalance: number } }>(['growth', 'overview'])
        ?.account,
    ).toMatchObject({ currentXp: 110, level: 2, coinBalance: 5 });

    applyOptimisticGrowthReceipt(queryClient, {
      sourceType: 'TASK',
      sourceId: 'task-1',
      title: 'Exercise',
      reverted: true,
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
          kind: 'ATTRIBUTE',
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
      coinAward: { amount: 2, balanceAfter: 3 },
      itemAwards: [],
    });

    expect(
      queryClient.getQueryData<Array<{ currentXp: number; level: number }>>(['growth', 'skills'])?.[0],
    ).toMatchObject({ currentXp: 90, level: 1, progressXp: 90, nextLevelXp: 100 });
    expect(
      queryClient.getQueryData<{ account: { currentXp: number; coinBalance: number } }>(['growth', 'overview'])
        ?.account,
    ).toMatchObject({ currentXp: 90, level: 1, coinBalance: 3 });
  });

  it('does not insert task changes into nested relation arrays', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ['tasks', 'all'],
      [
        {
          id: 'task-1',
          title: 'Before',
          version: 1,
          children: [],
          reminders: [],
          tags: [],
        },
        {
          id: 'task-2',
          title: 'Unrelated',
          version: 1,
          children: [],
          reminders: [],
          tags: [],
        },
      ],
    );

    applySyncChanges(queryClient, {
      acknowledgedMutationIds: [],
      cursor: '6',
      conflicts: [],
      changes: [
        {
          entityType: 'task',
          entityId: 'task-1',
          deleted: false,
          data: { id: 'task-1', status: 'IN_PROGRESS', version: 2 },
        },
      ],
    });

    expect(queryClient.getQueryData(['tasks', 'all'])).toEqual([
      {
        id: 'task-1',
        title: 'Before',
        status: 'IN_PROGRESS',
        version: 2,
        children: [],
        reminders: [],
        tags: [],
      },
      {
        id: 'task-2',
        title: 'Unrelated',
        version: 1,
        children: [],
        reminders: [],
        tags: [],
      },
    ]);
  });

  it('keeps a newer optimistic task status when an older change arrives', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ['tasks', 'all'],
      [{ id: 'task-1', title: 'Task', status: 'COMPLETED', version: 3, completedAt: '2026-07-27T10:00:00.000Z' }],
    );

    applySyncChanges(queryClient, {
      acknowledgedMutationIds: [],
      cursor: '7',
      conflicts: [],
      changes: [
        {
          entityType: 'task',
          entityId: 'task-1',
          deleted: false,
          data: { id: 'task-1', status: 'IN_PROGRESS', version: 2, completedAt: null },
        },
      ],
    });

    expect(queryClient.getQueryData(['tasks', 'all'])).toEqual([
      { id: 'task-1', title: 'Task', status: 'COMPLETED', version: 3, completedAt: '2026-07-27T10:00:00.000Z' },
    ]);
  });

  it('removes tombstoned entities without clearing unrelated data', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['decks'], {
      data: [
        { id: 'deck-1', title: 'Delete' },
        { id: 'deck-2', title: 'Keep' },
      ],
      meta: { hasNextPage: false },
    });

    applySyncChanges(queryClient, {
      acknowledgedMutationIds: [],
      cursor: '6',
      conflicts: [],
      changes: [{ entityType: 'deck', entityId: 'deck-1', deleted: true, data: { id: 'deck-1' } }],
    });

    expect(queryClient.getQueryData(['decks'])).toEqual({
      data: [{ id: 'deck-2', title: 'Keep' }],
      meta: { hasNextPage: false },
    });
  });

  it('routes focus-session changes only to focus queries', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['focus', 'active'], { id: 'focus-1', status: 'ACTIVE', version: 1 });
    queryClient.setQueryData(['decks'], { data: [{ id: 'deck-1', title: 'Keep' }] });

    applySyncChanges(queryClient, {
      acknowledgedMutationIds: [],
      cursor: '7',
      conflicts: [],
      changes: [
        {
          entityType: 'focussession',
          entityId: 'focus-1',
          deleted: false,
          data: { id: 'focus-1', status: 'PAUSED', version: 2 },
        },
      ],
    });

    expect(queryClient.getQueryData(['focus', 'active'])).toEqual({
      id: 'focus-1',
      status: 'PAUSED',
      version: 2,
    });
    expect(queryClient.getQueryData(['decks'])).toEqual({ data: [{ id: 'deck-1', title: 'Keep' }] });
  });

  it('inserts optimistic cards only into card collections', () => {
    const queryClient = new QueryClient();
    const deckPage = {
      pages: [{ data: [{ id: 'deck-1', title: 'Deck', version: 1 }], meta: { nextCursor: null } }],
      pageParams: [null],
    };
    const cardPage = {
      pages: [{ data: [], meta: { nextCursor: null } }],
      pageParams: [null],
    };
    queryClient.setQueryData(['decks', 'move-options'], deckPage);
    queryClient.setQueryData(['cards', 'deck-1', ''], cardPage);

    const card = {
      id: 'card-1',
      deckId: 'deck-1',
      promptRichText: 'Front',
      answerRichText: 'Back',
      version: 1,
    };
    applySyncChanges(queryClient, {
      acknowledgedMutationIds: [],
      cursor: '',
      conflicts: [],
      changes: [{ entityType: 'card', entityId: card.id, deleted: false, data: card }],
    });

    expect(queryClient.getQueryData(['decks', 'move-options'])).toEqual(deckPage);
    expect(queryClient.getQueryData(['cards', 'deck-1', ''])).toEqual({
      ...cardPage,
      pages: [{ ...cardPage.pages[0], data: [card] }],
    });
  });

  it('does not insert optimistic card images into card collections', () => {
    const queryClient = new QueryClient();
    const cardPage = {
      pages: [
        {
          data: [{ id: 'card-1', deckId: 'deck-1', promptRichText: 'Front', answerRichText: 'Back', version: 1 }],
          meta: { nextCursor: null },
        },
      ],
      pageParams: [null],
    };
    queryClient.setQueryData(['cards', 'deck-1', ''], cardPage);

    applySyncChanges(queryClient, {
      acknowledgedMutationIds: [],
      cursor: '',
      conflicts: [],
      changes: [
        {
          entityType: 'cardimage',
          entityId: 'image-1',
          deleted: false,
          data: { id: 'image-1', cardId: 'card-1', url: '/images/image-1.png' },
        },
      ],
    });

    expect(queryClient.getQueryData(['cards', 'deck-1', ''])).toEqual(cardPage);
  });

  it('invalidates habit and occurrence views for remote habit changes', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['habits'], [{ id: 'habit-1', name: 'Read' }]);
    queryClient.setQueryData(['habit-occurrences', '2026-07-25'], [{ id: 'occurrence-1', status: 'PENDING' }]);
    queryClient.setQueryData(['habit-stats', 'habit-1'], { currentStreak: 0 });

    await invalidateSyncChanges(queryClient, {
      acknowledgedMutationIds: [],
      cursor: '8',
      conflicts: [],
      changes: [
        {
          entityType: 'habitoccurrence',
          entityId: 'occurrence-1',
          deleted: false,
          data: { id: 'occurrence-1', status: 'COMPLETED' },
        },
      ],
    });

    expect(queryClient.getQueryState(['habit-occurrences', '2026-07-25'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['habit-stats', 'habit-1'])?.isInvalidated).toBe(true);
    // Habit stats are embedded in the habits list response, so occurrence changes
    // must also invalidate the habits list to refresh per-row streak data.
    expect(queryClient.getQueryState(['habits'])?.isInvalidated).toBe(true);
  });

  it('invalidates an optimistic mapping cache when the server reports a mapping conflict', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['growth', 'attribute-mappings', 'skill-1'], [{ id: 'optimistic' }]);

    await invalidateSyncChanges(queryClient, {
      acknowledgedMutationIds: [],
      cursor: '8-conflict',
      changes: [],
      conflicts: [
        {
          mutationId: 'mutation-1',
          entityType: 'growthattributemapping',
          entityId: 'skill-1',
          reason: 'VERSION_CONFLICT',
          serverData: null,
          localDraft: {},
        },
      ],
    });

    expect(queryClient.getQueryState(['growth', 'attribute-mappings', 'skill-1'])?.isInvalidated).toBe(true);
  });

  it('does not restart an active resource request when a sync change arrives', async () => {
    const queryClient = new QueryClient();
    let resolveRequest: ((value: Array<{ id: string }>) => void) | undefined;
    let requestCount = 0;
    const observer = new QueryObserver(queryClient, {
      queryKey: ['tasks', 'all'],
      queryFn: () => {
        requestCount += 1;
        return new Promise<Array<{ id: string }>>((resolve) => {
          resolveRequest = resolve;
        });
      },
    });
    const unsubscribe = observer.subscribe(() => undefined);

    const invalidation = invalidateSyncChanges(queryClient, {
      acknowledgedMutationIds: [],
      cursor: '9',
      conflicts: [],
      changes: [
        {
          entityType: 'task',
          entityId: 'task-1',
          deleted: false,
          data: { id: 'task-1', title: 'Changed' },
        },
      ],
    });

    expect(requestCount).toBe(1);
    resolveRequest?.([{ id: 'task-1' }]);
    await invalidation;
    unsubscribe();
  });

  it('applies a complete remote task to matching task views without refetching them', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['tasks', 'all', null, null, ''], []);
    queryClient.setQueryData(['tasks', 'inbox', null, null, ''], []);
    queryClient.setQueryData(['tasks', 'today', null, null, ''], []);
    const task = {
      id: 'task-1',
      title: 'Remote task',
      status: 'INBOX',
      taskListId: null,
      scheduledStartAt: null,
      dueAt: null,
      completedAt: null,
      sortOrder: 1,
      version: 2,
      tags: [],
    };

    await invalidateSyncChanges(queryClient, {
      acknowledgedMutationIds: [],
      cursor: '10',
      conflicts: [],
      changes: [
        {
          cursor: 10,
          entityType: 'task',
          entityId: 'task-1',
          deleted: false,
          data: task,
          complete: true,
        },
      ],
    });

    expect(queryClient.getQueryData(['tasks', 'all', null, null, ''])).toEqual([task]);
    expect(queryClient.getQueryData(['tasks', 'inbox', null, null, ''])).toEqual([task]);
    expect(queryClient.getQueryData(['tasks', 'today', null, null, ''])).toEqual([]);
    expect(queryClient.getQueryState(['tasks', 'all', null, null, ''])?.isInvalidated).toBe(false);
  });

  it('updates a complete remote task inside paginated task views without refetching them', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['tasks', 'all', null, null, ''], {
      data: [{ id: 'task-1', title: 'Task', status: 'PLANNED', sortOrder: 1, version: 1 }],
      meta: { hasNextPage: false, nextCursor: null },
    });

    await invalidateSyncChanges(queryClient, {
      acknowledgedMutationIds: [],
      cursor: '10',
      conflicts: [],
      changes: [
        {
          cursor: 10,
          entityType: 'task',
          entityId: 'task-1',
          deleted: false,
          data: { id: 'task-1', title: 'Task', status: 'IN_PROGRESS', sortOrder: 1, version: 2 },
          complete: true,
        },
      ],
    });

    expect(queryClient.getQueryData(['tasks', 'all', null, null, ''])).toEqual({
      data: [{ id: 'task-1', title: 'Task', status: 'IN_PROGRESS', sortOrder: 1, version: 2 }],
      meta: { hasNextPage: false, nextCursor: null },
    });
    expect(queryClient.getQueryState(['tasks', 'all', null, null, ''])?.isInvalidated).toBe(false);
  });

  it('updates a complete card inside loaded infinite-query pages', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['cards', 'deck-1', ''], {
      pages: [
        {
          data: [{ id: 'card-1', deckId: 'deck-1', promptRichText: 'Before', version: 1 }],
          meta: { hasNextPage: false },
        },
      ],
      pageParams: [undefined],
    });

    await invalidateSyncChanges(queryClient, {
      acknowledgedMutationIds: [],
      cursor: '11',
      conflicts: [],
      changes: [
        {
          cursor: 11,
          entityType: 'card',
          entityId: 'card-1',
          deleted: false,
          data: { id: 'card-1', deckId: 'deck-1', promptRichText: 'After', version: 2 },
          complete: true,
        },
      ],
    });

    expect(queryClient.getQueryData(['cards', 'deck-1', ''])).toMatchObject({
      pages: [{ data: [{ id: 'card-1', promptRichText: 'After', version: 2 }] }],
      pageParams: [undefined],
    });
  });

  it('does not persist pending query promises to IndexedDB', () => {
    const queryClient = new QueryClient();
    void queryClient.prefetchQuery({
      queryKey: ['tasks', 'pending'],
      queryFn: () => new Promise(() => undefined),
    });

    const dehydrated = dehydrate(queryClient, { shouldDehydrateQuery: shouldDehydrateOfflineQuery });

    expect(dehydrated.queries).toEqual([]);
    expect(() => structuredClone(dehydrated)).not.toThrow();
  });
});
