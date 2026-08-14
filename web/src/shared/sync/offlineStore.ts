import type { DehydratedState } from '@tanstack/react-query';
import type { ClientSyncMutation, SyncConflict } from './sync.types';
import { createUlid } from './syncIdentity';

const DATABASE_NAME = 'itu-offline-sync';
const DATABASE_VERSION = 2;
const META_STORE = 'meta';
const MUTATION_STORE = 'mutations';
const CONFLICT_STORE = 'conflicts';
const CACHE_STORE = 'cache';
const LEASE_STORE = 'lease';
const JOURNAL_ATTACHMENT_BLOB_STORE = 'journal-attachment-blobs';
const JOURNAL_ATTACHMENT_UPLOAD_STATE_STORE = 'journal-attachment-upload-state';

interface SyncLease {
  ownerId: string;
  token: string;
  expiresAt: number;
}

export interface JournalAttachmentBlobRecord {
  id: string;
  entryId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  blob: Blob;
  createdAt: number;
}

interface JournalAttachmentUploadStateRecord {
  attachmentId: string;
  attemptCount: number;
  lastAttemptAt?: string;
  status: 'PENDING' | 'UPLOADING' | 'FAILED' | 'SUCCESS';
  lastError?: string;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

class OfflineSyncStore {
  private databasePromise: Promise<IDBDatabase> | null = null;

  private database(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE);
        if (!database.objectStoreNames.contains(MUTATION_STORE)) {
          database.createObjectStore(MUTATION_STORE, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(CONFLICT_STORE)) {
          database.createObjectStore(CONFLICT_STORE, { keyPath: 'mutationId' });
        }
        if (!database.objectStoreNames.contains(CACHE_STORE)) database.createObjectStore(CACHE_STORE);
        if (!database.objectStoreNames.contains(LEASE_STORE)) database.createObjectStore(LEASE_STORE);
        if (!database.objectStoreNames.contains(JOURNAL_ATTACHMENT_BLOB_STORE)) {
          database.createObjectStore(JOURNAL_ATTACHMENT_BLOB_STORE, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(JOURNAL_ATTACHMENT_UPLOAD_STATE_STORE)) {
          database.createObjectStore(JOURNAL_ATTACHMENT_UPLOAD_STATE_STORE, { keyPath: 'attachmentId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Unable to open offline database'));
    });
    return this.databasePromise;
  }

  async listMutations(): Promise<ClientSyncMutation[]> {
    const database = await this.database();
    return requestResult(database.transaction(MUTATION_STORE).objectStore(MUTATION_STORE).getAll());
  }

  async putMutation(mutation: ClientSyncMutation): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(MUTATION_STORE, 'readwrite');
    transaction.objectStore(MUTATION_STORE).put(mutation);
    await transactionDone(transaction);
  }

  async deleteMutations(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const database = await this.database();
    const transaction = database.transaction(MUTATION_STORE, 'readwrite');
    const store = transaction.objectStore(MUTATION_STORE);
    ids.forEach((id) => store.delete(id));
    await transactionDone(transaction);
  }

  async replaceMutation(previousId: string, mutation: ClientSyncMutation): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(MUTATION_STORE, 'readwrite');
    const store = transaction.objectStore(MUTATION_STORE);
    store.delete(previousId);
    store.put(mutation);
    await transactionDone(transaction);
  }

  async markMutationsFailed(
    ids: string[],
    failure: { attemptCount: number; lastAttemptAt: string; nextRetryAt: string; lastErrorCode: string },
  ): Promise<void> {
    if (ids.length === 0) return;
    const database = await this.database();
    const transaction = database.transaction(MUTATION_STORE, 'readwrite');
    const store = transaction.objectStore(MUTATION_STORE);
    const idSet = new Set(ids);
    const mutations = (await requestResult(store.getAll())) as ClientSyncMutation[];
    for (const mutation of mutations) {
      if (idSet.has(mutation.id)) store.put({ ...mutation, ...failure });
    }
    await transactionDone(transaction);
  }

  async getCursor(): Promise<string> {
    const database = await this.database();
    return (await requestResult(database.transaction(META_STORE).objectStore(META_STORE).get('cursor'))) ?? '0';
  }

  async setCursor(cursor: string): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(META_STORE, 'readwrite');
    transaction.objectStore(META_STORE).put(cursor, 'cursor');
    await transactionDone(transaction);
  }

  async putConflicts(conflicts: SyncConflict[]): Promise<void> {
    if (conflicts.length === 0) return;
    const database = await this.database();
    const transaction = database.transaction(CONFLICT_STORE, 'readwrite');
    const store = transaction.objectStore(CONFLICT_STORE);
    conflicts.forEach((conflict) => store.put(conflict));
    await transactionDone(transaction);
  }

  async listConflicts(): Promise<SyncConflict[]> {
    const database = await this.database();
    return requestResult(database.transaction(CONFLICT_STORE).objectStore(CONFLICT_STORE).getAll());
  }

  async deleteConflict(mutationId: string): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(CONFLICT_STORE, 'readwrite');
    transaction.objectStore(CONFLICT_STORE).delete(mutationId);
    await transactionDone(transaction);
  }

  async saveCache(cache: DehydratedState): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(CACHE_STORE, 'readwrite');
    transaction.objectStore(CACHE_STORE).put(cache, 'tanstack-query');
    await transactionDone(transaction);
  }

  async loadCache(): Promise<DehydratedState | null> {
    const database = await this.database();
    return (
      (await requestResult(database.transaction(CACHE_STORE).objectStore(CACHE_STORE).get('tanstack-query'))) ?? null
    );
  }

  async acquireLease(ownerId: string, durationMs: number): Promise<SyncLease | null> {
    const database = await this.database();
    const transaction = database.transaction(LEASE_STORE, 'readwrite');
    const store = transaction.objectStore(LEASE_STORE);
    const current = (await requestResult(store.get('sync-leader'))) as SyncLease | undefined;
    const now = Date.now();
    if (current && current.ownerId !== ownerId && current.expiresAt > now) {
      transaction.abort();
      return null;
    }
    const lease = { ownerId, token: createUlid(), expiresAt: now + durationMs } satisfies SyncLease;
    store.put(lease, 'sync-leader');
    await transactionDone(transaction);
    return lease;
  }

  async releaseLease(ownerId: string, token: string): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(LEASE_STORE, 'readwrite');
    const store = transaction.objectStore(LEASE_STORE);
    const current = (await requestResult(store.get('sync-leader'))) as SyncLease | undefined;
    if (current?.ownerId === ownerId && current.token === token) store.delete('sync-leader');
    await transactionDone(transaction);
  }
}

export const offlineSyncStore = new OfflineSyncStore();
