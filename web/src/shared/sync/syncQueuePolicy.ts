import { ApiRequestError } from '../api/httpClient';
import type { ClientSyncMutation, SyncConflict } from './sync.types';

export function toSyncMutationPayload(mutation: ClientSyncMutation) {
  const { id, kind, entityId, baseVersion, baseValues, fieldEditedAt, payload, occurredAt } = mutation;
  return { id, kind, entityId, baseVersion, baseValues, fieldEditedAt, payload, occurredAt };
}

export function clearMutationFailure(mutation: ClientSyncMutation): ClientSyncMutation {
  const retry = { ...mutation };
  delete retry.attemptCount;
  delete retry.lastAttemptAt;
  delete retry.nextRetryAt;
  delete retry.lastErrorCode;
  return retry;
}

export function calculateRetryDelay(attempt: number, retryAfterMs?: number, random = Math.random): number {
  const exponential = Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1));
  const jittered = Math.round(exponential * (0.5 + random()));
  return Math.max(jittered, retryAfterMs ?? 0);
}

export function shouldAutoRebaseConflict(conflict: SyncConflict): boolean {
  return (
    conflict.kind === 'task.update' &&
    Array.isArray(conflict.conflictingFields) &&
    conflict.conflictingFields.length > 0 &&
    conflict.conflictingFields.every((field) => field === 'status')
  );
}

export function shouldAutomaticallyRetryErrorCode(errorCode: string): boolean {
  return errorCode !== 'AUTH' && errorCode !== 'CLIENT';
}

export function syncErrorCode(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401 || error.status === 403) return 'AUTH';
    if (error.status === 429) return 'RATE_LIMITED';
    if (error.status >= 500) return 'SERVER';
    return 'CLIENT';
  }
  return navigator.onLine ? 'NETWORK_OR_UNKNOWN' : 'OFFLINE';
}

export function reusedMutationId(error: unknown): string | null {
  if (!(error instanceof ApiRequestError) || error.code !== 'INVALID_SYNC_MUTATION') return null;
  if (error.details?.reason !== 'MUTATION_ID_REUSED') return null;
  const mutationId = error.details.mutationId;
  return typeof mutationId === 'string' && mutationId.length > 0 ? mutationId : null;
}

export function parseSyncCursor(value?: string): number | null {
  if (!value) return null;
  const cursor = Number(value);
  return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : null;
}

export function pickConflictBaseValues(conflict: SyncConflict): Record<string, unknown> | undefined {
  if (typeof conflict.serverData !== 'object' || conflict.serverData === null) return undefined;
  const serverData = conflict.serverData as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(conflict.localDraft).map((field) => [field, conflictServerFieldValue(serverData, field)]),
  );
}

function conflictServerFieldValue(serverData: Record<string, unknown>, field: string): unknown {
  if (field === 'tagIds' && Array.isArray(serverData.tags)) {
    return serverData.tags
      .map((assignment) => {
        if (typeof assignment !== 'object' || assignment === null) return null;
        const tag = (assignment as { tag?: unknown }).tag;
        if (typeof tag !== 'object' || tag === null) return null;
        const id = (tag as { id?: unknown }).id;
        return typeof id === 'string' ? id : null;
      })
      .filter((id): id is string => Boolean(id))
      .sort();
  }
  return serverData[field] ?? null;
}

export function coalesceMutation(
  mutations: ClientSyncMutation[],
  next: ClientSyncMutation,
): { mutation: ClientSyncMutation; replacedId?: string } {
  const entityMutations = mutations.filter(
    (mutation) =>
      mutation.entityId === next.entityId &&
      (isMutableQueuedMutation(mutation) ||
        (isGrowthAttributeMappingUpsert(mutation) && isGrowthAttributeMappingUpsert(next))),
  );
  const create = entityMutations.find((mutation) => mutation.kind.endsWith('.create'));
  let existing = create && next.kind.endsWith('.update') ? create : undefined;
  if (!existing && next.kind.endsWith('.update')) {
    for (let index = entityMutations.length - 1; index >= 0; index -= 1) {
      if (entityMutations[index].kind === next.kind) {
        existing = entityMutations[index];
        break;
      }
    }
  }
  if (!existing && isGrowthAttributeMappingUpsert(next)) {
    for (let index = entityMutations.length - 1; index >= 0; index -= 1) {
      if (isGrowthAttributeMappingUpsert(entityMutations[index])) {
        existing = entityMutations[index];
        break;
      }
    }
  }
  if (!existing && (next.kind.startsWith('preferences.') || next.kind.startsWith('preferences:'))) {
    for (let index = entityMutations.length - 1; index >= 0; index -= 1) {
      if (entityMutations[index].kind === next.kind) {
        existing = entityMutations[index];
        break;
      }
    }
  }
  if (!existing) return { mutation: next };
  if (!canCompactGymMutation(existing, next)) return { mutation: next };
  return {
    replacedId: existing.id,
    mutation: {
      ...next,
      kind: existing.kind.endsWith('.create') ? existing.kind : next.kind,
      id: existing.id,
      baseVersion: existing.baseVersion ?? next.baseVersion,
      baseValues: { ...next.baseValues, ...existing.baseValues },
      ...(existing.fieldEditedAt || next.fieldEditedAt
        ? { fieldEditedAt: { ...existing.fieldEditedAt, ...next.fieldEditedAt } }
        : {}),
      payload: { ...existing.payload, ...next.payload },
      occurredAt: existing.occurredAt,
    },
  };
}

/**
 * A set type and completion are semantic transitions, not ordinary field edits.
 * Keep those records separate so retries/restarts cannot erase the transition.
 */
function canCompactGymMutation(existing: ClientSyncMutation, next: ClientSyncMutation): boolean {
  const semanticFields = new Set(['type', 'completedAt']);
  const existingSet = existing.kind.startsWith('workout-set.');
  const nextSet = next.kind.startsWith('workout-set.');
  if (!existingSet || !nextSet) return true;
  if (existing.kind === 'workout-set.create' && next.kind === 'workout-set.update') {
    return !Object.keys(next.payload).some((field) => semanticFields.has(field));
  }
  if (existing.kind !== 'workout-set.update' || next.kind !== 'workout-set.update') return false;
  return (
    !Object.keys(existing.payload).some((field) => semanticFields.has(field)) &&
    !Object.keys(next.payload).some((field) => semanticFields.has(field))
  );
}

export function supersededGrowthMappingMutationIds(
  mutations: ClientSyncMutation[],
  acknowledgedMutationIds: string[],
  inFlightMutationIds: ReadonlySet<string> = new Set(),
  acknowledgedMutations: ClientSyncMutation[] = mutations,
) {
  const acknowledged = acknowledgedMutations.filter(
    (mutation) => acknowledgedMutationIds.includes(mutation.id) && isGrowthAttributeMappingUpsert(mutation),
  );
  if (acknowledged.length === 0) return [];
  return mutations
    .filter(
      (mutation) =>
        isGrowthAttributeMappingUpsert(mutation) &&
        !acknowledgedMutationIds.includes(mutation.id) &&
        !inFlightMutationIds.has(mutation.id) &&
        acknowledged.some(
          (acknowledgedMutation) =>
            acknowledgedMutation.entityId === mutation.entityId &&
            compareMutationOrder(acknowledgedMutation, mutation) > 0,
        ),
    )
    .map((mutation) => mutation.id);
}

function compareMutationOrder(left: ClientSyncMutation, right: ClientSyncMutation) {
  const occurredAt = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
  return occurredAt || left.id.localeCompare(right.id);
}

export function isGrowthAttributeMappingUpsert(mutation: ClientSyncMutation): boolean {
  return mutation.kind === 'growthattributemapping.upsert';
}

function isMutableQueuedMutation(mutation: ClientSyncMutation): boolean {
  return (
    mutation.attemptCount === undefined &&
    mutation.lastAttemptAt === undefined &&
    mutation.nextRetryAt === undefined &&
    mutation.lastErrorCode === undefined
  );
}
