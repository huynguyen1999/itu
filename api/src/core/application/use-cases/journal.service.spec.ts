import { JournalService } from './journal/journal.service';
import { JournalEntryKind } from '@core/domain/enums';

describe('JournalService', () => {
  let service: JournalService;
  let mockJournalRepo: any;
  let mockTemplateRepo: any;
  let mockTagRepo: any;
  let mockAttachmentRepo: any;
  let mockWeeklyReviewQuery: any;

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
    mockAttachmentRepo = {
      create: jest.fn().mockResolvedValue({ id: 'att1' }),
      delete: jest.fn().mockResolvedValue(true),
    };
    mockWeeklyReviewQuery = {
      getSnapshotData: jest.fn().mockResolvedValue({
        tasksCompleted: 10,
        focusPlannedSeconds: 7200,
        focusSessions: 4,
        habitsScheduled: 15,
        habitsCompleted: 12,
        reviews: 50,
        expenses: { VND: '100000.00' },
        workouts: 2,
        xpEarned: 300,
      }),
    };

    service = new JournalService(
      mockJournalRepo,
      mockTemplateRepo,
      mockTagRepo,
      mockAttachmentRepo,
      mockWeeklyReviewQuery,
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
      expenses: { VND: '100000.00' },
      workouts: { sessions: 2 },
      growth: { xpEarned: 300 },
    });
  });
});
