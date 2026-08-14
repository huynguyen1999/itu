export interface ClientSyncMutation {
  id: string;
  kind: string;
  entityId: string;
  baseVersion?: number;
  baseValues?: Record<string, unknown>;
  fieldEditedAt?: Record<string, string>;
  payload: Record<string, unknown>;
  occurredAt: string;
  attemptCount?: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  lastErrorCode?: string;
}

export interface SyncConflict {
  mutationId: string;
  entityType: string;
  entityId: string;
  reason: string;
  serverData: unknown;
  localDraft: Record<string, unknown>;
  conflictingFields?: string[];
  kind?: string;
  occurredAt?: string;
}
