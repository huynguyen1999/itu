import { PrismaSyncJournal } from './prisma-sync-journal';
import { JournalEntryKind } from '@prisma/client';

describe('PrismaSyncJournal', () => {
  let syncJournal: PrismaSyncJournal;
  let mockTx: any;

  beforeEach(() => {
    syncJournal = new PrismaSyncJournal();
    mockTx = {
      journalTag: { count: jest.fn().mockResolvedValue(0), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      journalAttachment: { findFirst: jest.fn().mockResolvedValue({ id: '01HKEY1234567890ABCDEFGH02', userId: 'user1' }), update: jest.fn().mockResolvedValue({ id: '01HKEY1234567890ABCDEFGH02' }) },
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

  it('creates an owned normalized journal tag idempotently', async () => {
    mockTx.journalTag.findFirst.mockResolvedValueOnce(null);
    mockTx.journalTag.upsert = jest.fn().mockResolvedValue({ id: '01HKEY1234567890ABCDEFGH02', userId: 'user1', name: 'work', color: 'BLUE' });
    const conflict = await syncJournal.applyMutation(mockTx, 'user1', {
      id: 'mut-tag', kind: 'journal_tag.create', entityId: '01HKEY1234567890ABCDEFGH02', occurredAt: new Date().toISOString(), payload: { name: ' Work ', color: 'blue' },
    });
    expect(conflict).toBeNull();
    expect(mockTx.journalTag.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ name: 'work', color: 'BLUE', userId: 'user1' }) }));
    expect(mockTx.syncChange.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entityType: 'journaltag', entityId: '01HKEY1234567890ABCDEFGH02' }) }));
  });

  it('supports offline attachment tombstones', async () => {
    const conflict = await syncJournal.applyMutation(mockTx, 'user1', { id: 'mut-att', kind: 'journal_attachment.delete', entityId: '01HKEY1234567890ABCDEFGH02', payload: {} } as any);
    expect(conflict).toBeNull();
    expect(mockTx.journalAttachment.update).toHaveBeenCalled();
    expect(mockTx.syncChange.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entityType: 'journalattachment', operation: 'DELETE' }) }));
  });

  it('uses the server-provided sync device on delete tombstones', async () => {
    await syncJournal.applyMutation(mockTx, 'user1', {
      id: 'mut-delete',
      kind: 'journal.delete',
      entityId: '01HKEY1234567890ABCDEFGH01',
      payload: {},
      serverDeviceId: 'server-device-1',
    } as any);

    expect(mockTx.journalEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deletedByDeviceId: 'server-device-1' }),
    }));
  });

  it('rejects a stale journal restore without mutating the entry', async () => {
    mockTx.journalEntry.update.mockClear();
    const conflict = await syncJournal.applyMutation(mockTx, 'user1', {
      id: 'mut-stale-restore',
      kind: 'journal.restore',
      entityId: '01HKEY1234567890ABCDEFGH01',
      baseVersion: 0,
      payload: {},
    } as any);

    expect(conflict).toMatchObject({ reason: 'STALE_VERSION', entityType: 'journalentry' });
    expect(mockTx.journalEntry.update).not.toHaveBeenCalled();
  });

  it('restores revision tags and emits hydrated assignments', async () => {
    mockTx.journalEntryRevision.findFirst = jest.fn().mockResolvedValue({ id: 'rev1', entryId: '01HKEY1234567890ABCDEFGH01', snapshot: { title: 'Restored', contentMarkdown: '', entryDate: '2026-08-01', tags: [{ id: 'tag1' }] } });
    mockTx.journalEntryRevision.count = jest.fn().mockResolvedValue(1);
    mockTx.journalEntry.update.mockResolvedValue({ id: '01HKEY1234567890ABCDEFGH01', version: 2 });
    mockTx.journalTag.count.mockResolvedValue(1);
    mockTx.journalEntry.findUniqueOrThrow.mockResolvedValue({ id: '01HKEY1234567890ABCDEFGH01', tags: [{ tag: { id: 'tag1' } }] });
    await syncJournal.applyMutation(mockTx, 'user1', { id: 'm-restore', kind: 'journal_revision.restore', entityId: 'rev1', payload: {} } as any);
    expect(mockTx.journalTagAssignment.deleteMany).toHaveBeenCalledWith({ where: { entryId: '01HKEY1234567890ABCDEFGH01' } });
    expect(mockTx.journalTagAssignment.createMany).toHaveBeenCalledWith({ data: [{ entryId: '01HKEY1234567890ABCDEFGH01', tagId: 'tag1' }] });
  });
});
