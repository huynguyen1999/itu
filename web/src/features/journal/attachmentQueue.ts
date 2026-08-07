import { api } from '../../shared/api/client';
import { offlineSyncStore, type JournalAttachmentBlobRecord } from '../../shared/sync/offlineStore';
import { createUlid } from '../../shared/sync/syncIdentity';

export interface EnqueueAttachmentInput {
  entryId: string;
  file: File;
}

export async function enqueueJournalAttachment({ entryId, file }: EnqueueAttachmentInput) {
  const attachmentId = createUlid();
  const record: JournalAttachmentBlobRecord = {
    id: attachmentId,
    entryId,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    blob: file,
    createdAt: Date.now(),
  };

  if (typeof indexedDB !== 'undefined') {
    const database = (offlineSyncStore as any).database
      ? await (offlineSyncStore as any).database()
      : null;

    if (database) {
      const tx = database.transaction(['journal-attachment-blobs', 'journal-attachment-upload-state'], 'readwrite');
      tx.objectStore('journal-attachment-blobs').put(record);
      tx.objectStore('journal-attachment-upload-state').put({
        attachmentId,
        attemptCount: 0,
        status: 'PENDING',
      });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
    }
  }

  // Trigger background upload if online
  if (navigator.onLine) {
    void processJournalAttachmentQueue();
  }

  return {
    id: attachmentId,
    entryId,
    fileName: file.name,
    mimeType: record.mimeType,
    sizeBytes: file.size,
    storageKey: `local-blob:${attachmentId}`,
    url: URL.createObjectURL(file),
    createdAt: new Date(record.createdAt).toISOString(),
  };
}

export async function processJournalAttachmentQueue(): Promise<void> {
  if (!navigator.onLine) return;
  const database = (offlineSyncStore as any).database
    ? await (offlineSyncStore as any).database()
    : null;
  if (!database) return;

  const blobsRequest = database.transaction('journal-attachment-blobs').objectStore('journal-attachment-blobs').getAll();
  const blobRecords: JournalAttachmentBlobRecord[] = await new Promise((resolve, reject) => {
    blobsRequest.onsuccess = () => resolve(blobsRequest.result);
    blobsRequest.onerror = () => reject(blobsRequest.error);
  });

  for (const item of blobRecords) {
    try {
      const formData = new FormData();
      formData.append('entryId', item.entryId);
      formData.append('file', item.blob, item.fileName);

      await api.post('/journal/attachments/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Delete uploaded blob from IndexedDB
      const delTx = database.transaction(['journal-attachment-blobs', 'journal-attachment-upload-state'], 'readwrite');
      delTx.objectStore('journal-attachment-blobs').delete(item.id);
      delTx.objectStore('journal-attachment-upload-state').delete(item.id);
    } catch (err) {
      console.warn(`Failed to upload attachment ${item.id}:`, err);
    }
  }
}
