import { describe, expect, it } from 'vitest';
import { rowsForFilter } from './TrashPage';
import type { TrashSnapshot } from '@/shared/api/types';

const snapshot: TrashSnapshot = {
  decks: [
    { id: 'deck-1', title: 'Deck', description: null, icon: 'BOOK', color: 'TEAL', isDefault: false, archived: true },
  ],
  cards: [
    {
      id: 'card-1',
      deckId: 'deck-1',
      type: 'BASIC',
      promptRichText: '# Prompt',
      answerRichText: 'Answer',
      tags: [],
      images: [],
    },
  ],
  cardImages: [
    {
      id: 'image-1',
      cardId: 'card-1',
      side: 'PROMPT',
      url: '/image',
      width: 10,
      height: 10,
      deletedAt: '2026-08-10T00:00:00.000Z',
    },
  ],
  tasks: [
    {
      id: 'task-1',
      title: 'Task',
      descriptionMarkdown: '',
      priority: 'NONE',
      important: false,
      urgent: false,
      urgencyReason: '',
      status: 'INBOX',
      sortOrder: 1,
      version: 1,
      tags: [],
      reminders: [],
      children: [],
      deletedAt: '2026-08-10T00:00:00.000Z',
    },
  ],
  journalEntries: [{ id: 'entry-1', kind: 'NOTE', title: 'Note', version: 2, deletedAt: '2026-08-10T00:00:00.000Z' }],
  budgetTransactions: [
    {
      id: 'transaction-1',
      amount: '12.50',
      currency: 'VND',
      type: 'EXPENSE',
      merchant: 'Coffee',
      version: 2,
      deletedAt: '2026-08-10T00:00:00.000Z',
    },
  ],
  gymWorkouts: [
    { id: 'workout-1', title: 'Workout', status: 'COMPLETED', version: 2, deletedAt: '2026-08-10T00:00:00.000Z' },
  ],
  gymExercises: [{ id: 'exercise-1', name: 'Squat', version: 2, deletedAt: '2026-08-10T00:00:00.000Z' }],
};

describe('TrashPage filters', () => {
  it('keeps legacy learning records in All and out of the focused filters', () => {
    expect(rowsForFilter(snapshot, 'All')).toHaveLength(8);
    expect(rowsForFilter(snapshot, 'Tasks').map((row) => row.title)).toEqual(['Task']);
    expect(rowsForFilter(snapshot, 'Journal').map((row) => row.title)).toEqual(['Note']);
    expect(rowsForFilter(snapshot, 'Budget').map((row) => row.title)).toEqual(['Coffee']);
    expect(rowsForFilter(snapshot, 'Gym').map((row) => row.title)).toEqual(['Workout', 'Squat']);
  });

  it('keeps truthful type and decimal amount metadata', () => {
    const budget = rowsForFilter(snapshot, 'Budget')[0];
    expect(budget.typeLabel).toBe('Budget transaction');
    expect(budget.detail).toBe('12.50 VND');
  });
});
