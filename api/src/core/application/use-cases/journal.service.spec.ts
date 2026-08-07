import { JournalService } from './journal/journal.service';
import { JournalEntryKind } from '@core/domain/enums';

describe('JournalService', () => {
  let service: JournalService;
  let mockJournalRepo: any;
  let mockTemplateRepo: any;
  let mockTagRepo: any;
  let mockExerciseRepo: any;
  let mockAttachmentRepo: any;
  let mockPrisma: any;

  beforeEach(() => {
    mockJournalRepo = {
      list: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((_, data) => Promise.resolve({ id: data.id, ...data })),
      update: jest.fn().mockImplementation((_, id, data) => Promise.resolve({ id, ...data })),
      delete: jest.fn().mockResolvedValue(true),
      restore: jest.fn().mockImplementation((_, id) => Promise.resolve({ id, deletedAt: null })),
      listRevisions: jest.fn().mockResolvedValue([]),
      restoreRevision: jest.fn().mockResolvedValue({ id: 'entry1' }),
    };
    mockTemplateRepo = {
      list: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((_, data) => Promise.resolve({ id: 't1', ...data })),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(true),
    };
    mockTagRepo = {
      list: jest.fn().mockResolvedValue([]),
      findOrCreateByName: jest.fn().mockResolvedValue({ id: 'tag1', name: 'work' }),
    };
    mockExerciseRepo = {
      list: jest.fn().mockResolvedValue([]),
      findOrCreateByName: jest.fn().mockResolvedValue({ id: 'ex1', name: 'Bench Press' }),
    };
    mockAttachmentRepo = {
      create: jest.fn().mockResolvedValue({ id: 'att1' }),
      delete: jest.fn().mockResolvedValue(true),
    };
    mockPrisma = {
      task: { count: jest.fn().mockResolvedValue(10) },
      focusSession: { aggregate: jest.fn().mockResolvedValue({ _sum: { plannedSeconds: 7200 }, _count: 4 }) },
      habitOccurrence: {
        aggregate: jest.fn().mockResolvedValue({ _count: 15 }),
        count: jest.fn().mockResolvedValue(12),
      },
      reviewLog: { count: jest.fn().mockResolvedValue(50) },
      journalExpense: { findMany: jest.fn().mockResolvedValue([{ amount: 100000, currency: 'VND' }]) },
      journalWorkout: { count: jest.fn().mockResolvedValue(2) },
      growthLedgerEntry: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 300 } }) },
    };

    service = new JournalService(
      mockJournalRepo,
      mockTemplateRepo,
      mockTagRepo,
      mockExerciseRepo,
      mockAttachmentRepo,
      mockPrisma,
    );
  });

  it('should create a journal entry', async () => {
    const res = await service.createEntry('user1', {
      id: '01HKEY1234567890ABCDEFGH01',
      kind: JournalEntryKind.NOTE,
      title: 'Test Daily Note',
      entryDate: new Date('2026-08-07'),
    });
    expect(res.title).toBe('Test Daily Note');
    expect(mockJournalRepo.create).toHaveBeenCalledWith('user1', expect.any(Object), undefined);
  });

  it('should calculate weekly review snapshot deterministically', async () => {
    const snapshot = await service.buildWeeklyReviewSnapshot('user1', new Date('2026-08-01'), new Date('2026-08-07'));
    expect(snapshot).toEqual({
      tasks: { completed: 10 },
      focus: { minutes: 120, sessions: 4 },
      habits: { completed: 12, scheduled: 15 },
      learning: { reviews: 50 },
      expenses: { VND: 100000 },
      workouts: { sessions: 2 },
      growth: { xpEarned: 300 },
    });
  });
});
