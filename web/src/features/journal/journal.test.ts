import { describe, expect, it } from 'vitest';
import { enqueueJournalAttachment } from './attachmentQueue';

describe('Journal Web Feature', () => {
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
});
