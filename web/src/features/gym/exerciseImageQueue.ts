import { api } from '@/shared/api/client';
import { offlineSyncStore, type JournalAttachmentBlobRecord } from '@/shared/sync/offlineStore';
import { createUlid } from '@/shared/sync/syncIdentity';

let processingQueue: Promise<void> | null = null;

export async function enqueueGymExerciseImage(exerciseId: string, file: File): Promise<{ id: string; url: string }> {
  const id = createUlid();
  const database = typeof indexedDB === 'undefined' ? null : await (offlineSyncStore as any).database();
  if (database) {
    const record = {
      id,
      entryId: exerciseId,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      blob: file,
      createdAt: Date.now(),
      feature: 'gym' as const,
    };
    const transaction = database.transaction(['journal-attachment-blobs', 'journal-attachment-upload-state'], 'readwrite');
    transaction.objectStore('journal-attachment-blobs').put(record);
    transaction.objectStore('journal-attachment-upload-state').put({ attachmentId: id, attemptCount: 0, status: 'PENDING', feature: 'gym' });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
  if (isOnline()) void processGymExerciseImageQueue();
  return { id, url: URL.createObjectURL(file) };
}

export async function processGymExerciseImageQueue(): Promise<void> {
  if (processingQueue) return processingQueue;
  processingQueue = processGymExerciseImageQueueInternal().finally(() => {
    processingQueue = null;
  });
  return processingQueue;
}

async function processGymExerciseImageQueueInternal(): Promise<void> {
  if (!isOnline() || typeof indexedDB === 'undefined') return;
  const database = await (offlineSyncStore as any).database();
  const request = database.transaction('journal-attachment-blobs').objectStore('journal-attachment-blobs').getAll();
  const records = await new Promise<Array<JournalAttachmentBlobRecord & { feature?: string }>>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  for (const record of records.filter((item) => item.feature === 'gym')) {
    try {
      const form = new FormData();
      form.append('file', record.blob, record.fileName);
      await api.post(`/gym/exercises/${record.entryId}/image`, form);
      const transaction = database.transaction(['journal-attachment-blobs', 'journal-attachment-upload-state'], 'readwrite');
      transaction.objectStore('journal-attachment-blobs').delete(record.id);
      transaction.objectStore('journal-attachment-upload-state').delete(record.id);
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch {
      // Leave the blob in the queue for the next online retry.
    }
  }
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}
