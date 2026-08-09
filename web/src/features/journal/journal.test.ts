import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../shared/api/client';
import { offlineSyncStore } from '../../shared/sync/offlineStore';
import { enqueueJournalAttachment, processJournalAttachmentQueue } from './attachmentQueue';
import {
  createJournalTag,
  deleteJournalAttachment,
  restoreJournalRevision,
  updateJournalTemplate,
} from './journalMutations';
import type { JournalEntryKind } from './journal.types';

describe('Journal Web Feature', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('enqueues attachment blob for offline store', async () => {
    const dummyFile = new File(['hello journal'], 'test.txt', { type: 'text/plain' });
    const local = await enqueueJournalAttachment({
      entryId: 'entry-123',
      file: dummyFile,
    });

    expect(local.entryId).toBe('entry-123');
    expect(local.fileName).toBe('test.txt');
    expect(local.mimeType).toBe('text/plain');
    expect(local.sizeBytes).toBe(13);
    expect(local.storageKey).toContain('local-blob:');
  });

  it('limits journal kinds to notes and weekly reviews', () => {
    const retainedKinds: JournalEntryKind[] = ['NOTE', 'WEEKLY_REVIEW'];
    // @ts-expect-error Structured expense entries are no longer Journal kinds.
    const removedExpenseKind: JournalEntryKind = 'EXPENSE';
    // @ts-expect-error Structured workout entries are no longer Journal kinds.
    const removedWorkoutKind: JournalEntryKind = 'WORKOUT';

    expect(retainedKinds).toEqual(['NOTE', 'WEEKLY_REVIEW']);
    expect(removedExpenseKind).toBe('EXPENSE');
    expect(removedWorkoutKind).toBe('WORKOUT');
  });

  it('uploads queued attachments without overriding the browser multipart boundary', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const request = {} as { onsuccess?: () => void; onerror?: () => void; result?: unknown; error?: Error };
    const database = {
      transaction: (stores: string | string[]) => {
        if (stores === 'journal-attachment-blobs') {
          return { objectStore: () => ({ getAll: () => request }) };
        }
        return { objectStore: () => ({ delete: vi.fn() }) };
      },
    };
    request.result = [
      {
        id: 'attachment-1',
        entryId: 'entry-1',
        fileName: 'note.txt',
        mimeType: 'text/plain',
        sizeBytes: 4,
        blob: new Blob(['note']),
        createdAt: Date.now(),
      },
    ];
    const store = offlineSyncStore as unknown as { database: () => Promise<unknown> };
    vi.spyOn(store, 'database').mockResolvedValue(database);
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    const upload = processJournalAttachmentQueue();
    queueMicrotask(() => request.onsuccess?.());
    await upload;

    expect(post).toHaveBeenCalledWith('/journal/attachments/upload', expect.any(FormData));
    expect(post.mock.calls[0]).toHaveLength(2);
    expect((post.mock.calls[0][1] as FormData).get('attachmentId')).toBe('attachment-1');
  });

  it('queues Journal tag creation with a client id and optimistic tag', async () => {
    const enqueue = vi.spyOn(api, 'enqueueOfflineMutation').mockImplementation(async (input) => input.optimistic);

    const created = await createJournalTag({ name: ' Work ' });
    const input = enqueue.mock.calls[0][0];

    expect(input.kind).toBe('journal_tag.create');
    expect(input.entityId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(input.payload).toMatchObject({ id: input.entityId, name: 'Work' });
    expect(created).toMatchObject({ id: input.entityId, name: 'work', color: 'SLATE', userId: 'local' });
  });

  it('falls back to the direct Journal tag REST endpoint without the client id', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { id: 'server-tag', name: 'work', color: 'SLATE' },
    });

    await createJournalTag({ name: ' Work ' });

    expect(post).toHaveBeenCalledWith('/journal/tags', { name: 'Work' });
  });

  it('queues Journal template updates for offline synchronization', async () => {
    const enqueue = vi.spyOn(api, 'enqueueOfflineMutation').mockImplementation(async (input) => input.optimistic);

    await updateJournalTemplate({
      id: 'template-1',
      name: 'Weekly reset',
      entryKind: 'WEEKLY_REVIEW',
      titleTemplate: 'Week {{date}}',
      bodyMarkdown: '## Review',
    });

    expect(enqueue.mock.calls[0][0]).toMatchObject({
      kind: 'journal_template.update',
      entityId: 'template-1',
      payload: { name: 'Weekly reset', entryKind: 'WEEKLY_REVIEW', titleTemplate: 'Week {{date}}', bodyMarkdown: '## Review' },
    });
  });

  it('queues attachment deletion and revision restore with their exact sync kinds', async () => {
    const enqueue = vi.spyOn(api, 'enqueueOfflineMutation').mockImplementation(async (input) => input.optimistic);

    await deleteJournalAttachment('attachment-1');
    await restoreJournalRevision({
      entryId: 'entry-1',
      revisionId: 'revision-1',
      snapshot: { title: 'Restored title', contentMarkdown: 'Restored body' },
    });

    expect(enqueue.mock.calls[0][0]).toMatchObject({
      kind: 'journal_attachment.delete',
      entityId: 'attachment-1',
      optimistic: { id: 'attachment-1' },
    });
    expect(enqueue.mock.calls[1][0]).toMatchObject({
      kind: 'journal_revision.restore',
      entityId: 'revision-1',
      payload: { entryId: 'entry-1', revisionId: 'revision-1' },
      optimistic: { id: 'entry-1', entryId: 'entry-1', title: 'Restored title', contentMarkdown: 'Restored body' },
    });
  });
});
