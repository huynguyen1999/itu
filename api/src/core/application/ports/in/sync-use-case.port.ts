export interface SyncMutation {
  id: string;
  kind: string;
  entityId: string;
  baseVersion?: number;
  baseValues?: Record<string, unknown>;
  payload: Record<string, unknown>;
  occurredAt: string;
  fieldEditedAt?: Record<string, string>;
}

export interface SyncMergeOutcome {
  mutationId: string;
  status: 'APPLIED' | 'AUTO_MERGED' | 'PARTIALLY_APPLIED' | 'MANUAL_CONFLICT';
  appliedFields: string[];
  serverWonFields: string[];
  manualFields: string[];
}

export interface SyncConflict {
  mutationId: string;
  entityType: string;
  entityId: string;
  reason: 'STALE_VERSION' | 'ENTITY_NOT_FOUND';
  serverData: unknown | null;
  localDraft: Record<string, unknown>;
  conflictingFields?: string[];
}

export interface SyncChange {
  cursor: number;
  resourceType: string;
  resourceId: string;
  operation: 'UPSERT' | 'DELETE';
  resource: unknown | null;
  complete: boolean;
}

export interface LegacySyncChange {
  cursor?: number;
  entityType: string;
  entityId: string;
  deleted: boolean;
  data: unknown | null;
}

export interface SyncResult {
  acknowledgedMutationIds: string[];
  cursor: string;
  lastSyncTime: string;
  changes: LegacySyncChange[];
  conflicts: SyncConflict[];
  mutationOutcomes: SyncMutationOutcome[];
}

export interface SyncMutationOutcome {
  mutationId: string;
  growthReceipt?: unknown;
}

export interface PushMutationsResult {
  acknowledgedMutationIds: string[];
  conflicts: SyncConflict[];
  latestServerCursor: string;
  mutationOutcomes: SyncMutationOutcome[];
}

export interface PullChangesResult {
  cursor: string;
  lastSyncTime: string;
  changes: SyncChange[];
}

export interface ISyncUseCase {
  pushMutations(
    userId: string,
    deviceId: string,
    clientInstanceId: string,
    mutations: SyncMutation[],
  ): Promise<PushMutationsResult>;
  pullChanges(userId: string, deviceId: string, cursorText: string | undefined): Promise<PullChangesResult>;
  synchronize(
    userId: string,
    deviceId: string,
    clientInstanceId: string,
    cursorText: string | undefined,
    mutations: SyncMutation[],
  ): Promise<SyncResult>;
}
