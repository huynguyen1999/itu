import { SyncConflict, SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import { InvalidSyncMutationException } from '@core/domain/exceptions';

export const HABIT_ACTION_MARKER_PREFIX = '__idempotency__:habit-action:';

// ─── Field conflict detection ───────────────────────────────────────────────

export function conflictingSyncFields(mutation: SyncMutation, serverData: Record<string, unknown>): string[] {
  const editedFields = Object.keys(mutation.payload).filter((field) => field !== 'version' && field !== 'id');
  if (!mutation.baseValues) return editedFields;
  return editedFields.filter((field) => {
    if (!Object.prototype.hasOwnProperty.call(mutation.baseValues, field)) return true;
    return !syncValuesEqual(mutation.baseValues?.[field], comparableSyncFieldValue(serverData, field));
  });
}

function comparableSyncFieldValue(serverData: Record<string, unknown>, field: string): unknown {
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

export function syncValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

// ─── Validation helpers ─────────────────────────────────────────────────────

export function assertClientId(value: string): void {
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(value))
    throw new InvalidSyncMutationException('Offline entity IDs must be ULIDs');
}

export function requiredString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new InvalidSyncMutationException(`${key} is required`);
  return value.trim();
}

export function optionalString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new InvalidSyncMutationException(`${key} must be a string`);
  return value.trim();
}

export function requiredInt(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  if (typeof value !== 'number' || !Number.isInteger(value))
    throw new InvalidSyncMutationException(`${key} must be an integer`);
  return value;
}

export function stringArray(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key] ?? [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new InvalidSyncMutationException(`${key} must be a string array`);
  }
  return value as string[];
}

export function numberArray(payload: Record<string, unknown>, key: string): number[] {
  const value = payload[key] ?? [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'number' || !Number.isInteger(item))) {
    throw new InvalidSyncMutationException(`${key} must be an integer array`);
  }
  return value as number[];
}

export function validatedGrowthInt(
  value: unknown,
  key: string,
  options: { min?: number; max?: number } = {},
): number | undefined {
  if (value === undefined || value === null) return undefined;
  const min = options.min ?? 0;
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < min || (options.max !== undefined && value > options.max)) {
    throw new InvalidSyncMutationException(`${key} must be an integer between ${min} and ${options.max ?? 'the maximum allowed value'}`);
  }
  return value;
}

export function awardsArray(payload: Record<string, unknown>, key: string): Array<{ id: string; amount: number }> {
  const value = payload[key] === undefined ? [] : payload[key];
  if (!Array.isArray(value)) throw new InvalidSyncMutationException(`${key} must be an array`);
  return value.map((item) => {
    if (typeof item !== 'object' || item === null)
      throw new InvalidSyncMutationException(`${key} contains an invalid award`);
    const record = item as Record<string, unknown>;
    const id =
      typeof record.skillId === 'string' ? record.skillId : typeof record.itemId === 'string' ? record.itemId : null;
    const hasXp = Object.prototype.hasOwnProperty.call(record, 'xpReward');
    const hasQuantity = Object.prototype.hasOwnProperty.call(record, 'quantity');
    const amount = hasXp
      ? validatedGrowthInt(record.xpReward, `${key}.xpReward`, { min: 0, max: 1_000_000 })
      : hasQuantity
        ? validatedGrowthInt(record.quantity, `${key}.quantity`, { min: 1, max: 10_000 })
        : undefined;
    if (!id || amount === null) throw new InvalidSyncMutationException(`${key} contains an invalid award`);
    if (amount === undefined) throw new InvalidSyncMutationException(`${key} contains an invalid award`);
    return { id, amount };
  });
}

export function enumValue<T extends Record<string, string>>(values: T, value: unknown, key: string): T[keyof T] {
  if (typeof value !== 'string' || !Object.values(values).includes(value)) {
    throw new InvalidSyncMutationException(`Invalid ${key}`);
  }
  return value as T[keyof T];
}

// ─── Conflict builders ──────────────────────────────────────────────────────

export function fieldConflict(
  mutation: SyncMutation,
  entityType: string,
  serverData: Record<string, unknown>,
): SyncConflict | null {
  if (mutation.baseVersion === undefined || mutation.baseVersion === serverData.version) return null;
  const conflicting = conflictingSyncFields(mutation, serverData);
  return conflicting.length > 0 ? stale(mutation, entityType, serverData, conflicting) : null;
}

export function stale(
  mutation: SyncMutation,
  entityType: string,
  serverData: object,
  conflictingFields?: string[],
): SyncConflict {
  return {
    mutationId: mutation.id,
    entityType,
    entityId: mutation.entityId,
    reason: 'STALE_VERSION',
    serverData,
    localDraft: mutation.payload,
    conflictingFields,
  };
}

export function notFound(mutation: SyncMutation, entityType: string): SyncConflict {
  return {
    mutationId: mutation.id,
    entityType,
    entityId: mutation.entityId,
    reason: 'ENTITY_NOT_FOUND',
    serverData: null,
    localDraft: mutation.payload,
  };
}
