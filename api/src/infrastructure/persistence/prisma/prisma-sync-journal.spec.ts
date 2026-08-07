import { PrismaSyncJournal } from './prisma-sync-journal';
import { JournalEntryKind } from '@prisma/client';

describe('PrismaSyncJournal', () => {
  let syncJournal: PrismaSyncJournal;
  let mockTx: any;

  beforeEach(() => {
    syncJournal = new PrismaSyncJournal();
    mockTx = {
      journalTag: { count: jest.fn().mockResolvedValue(0), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      journalEntry: {
        upsert: jest.fn().mockResolvedValue({ id: '01HKEY1234567890ABCDEFGH01' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: '01HKEY1234567890ABCDEFGH01',
          userId: 'user1',
          kind: JournalEntryKind.NOTE,
          title: 'Title',
          contentMarkdown: 'Content',
          entryDate: new Date(),
          timezone: 'UTC',
          version: 1,
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: '01HKEY1234567890ABCDEFGH01',
          userId: 'user1',
          kind: JournalEntryKind.NOTE,
          title: 'Title',
          contentMarkdown: 'Content',
          version: 1,
        }),
        update: jest.fn().mockResolvedValue({
          id: '01HKEY1234567890ABCDEFGH01',
          version: 2,
        }),
      },
      journalEntryRevision: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
      },
      syncChange: { create: jest.fn().mockResolvedValue({}) },
      journalWeeklyReview: { upsert: jest.fn() },
      journalExpense: { upsert: jest.fn() },
      journalWorkout: { upsert: jest.fn() },
      journalWorkoutExercise: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'ex1' }) },
      journalWorkoutSet: { create: jest.fn() },
      journalTagAssignment: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
  });

  it('should apply journal.create mutation successfully', async () => {
    const conflict = await syncJournal.applyMutation(mockTx, 'user1', {
      id: 'mut1',
      kind: 'journal.create',
      entityId: '01HKEY1234567890ABCDEFGH01',
      occurredAt: new Date().toISOString(),
      payload: {
        title: 'New Note',
        kind: 'NOTE',
        entryDate: '2026-08-07',
      },
    });

    expect(conflict).toBeNull();
    expect(mockTx.journalEntry.upsert).toHaveBeenCalled();
    expect(mockTx.journalEntryRevision.create).toHaveBeenCalled();
    expect(mockTx.syncChange.create).toHaveBeenCalled();
  });
});
