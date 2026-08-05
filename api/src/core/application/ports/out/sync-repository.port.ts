import { SyncChange, SyncConflict, SyncMutation } from '@core/application/ports/in/sync-use-case.port';

export interface SyncAiJobToEnqueue {
  id: string;
  kind: string;
}

export interface SyncMutationOutcome {
  mutationId: string;
  growthReceipt?: unknown;
}

export interface ApplySyncMutationsResult {
  acknowledgedMutationIds: string[];
  conflicts: SyncConflict[];
  aiJobsToEnqueue: SyncAiJobToEnqueue[];
  mutationOutcomes: SyncMutationOutcome[];
}

export interface SyncChangesResult {
  cursor: string;
  lastSyncTime: string;
  changes: SyncChange[];
}

export interface ISyncRepository {
  applyMutations(userId: string, deviceId: string, mutations: SyncMutation[]): Promise<ApplySyncMutationsResult>;
  changesSince(userId: string, cursor: number): Promise<SyncChangesResult>;
  currentCursor(userId: string): Promise<string>;
}
