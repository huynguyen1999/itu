import { SyncMergeOutcome, SyncMutation } from '@core/application/ports/in/sync-use-case.port';

export interface ExistingFieldClock {
  fieldName: string;
  editedAt: Date;
  deviceId: string;
  mutationId: string;
}

export interface FieldMergeResult {
  resolvedPayload: Record<string, unknown>;
  outcome: SyncMergeOutcome;
  updatedClocks: Array<{ fieldName: string; editedAt: Date }>;
}

export class SyncMergeResolver {
  /**
   * Resolves field-level Last-Write-Wins (LWW) and structural merges for a mutation
   * against existing field clocks and server data.
   */
  resolveMutationFields(
    mutation: SyncMutation,
    entityType: string,
    existingClocks: ExistingFieldClock[],
    serverData: Record<string, unknown> | null,
    deviceId: string,
  ): FieldMergeResult {
    const payload = { ...mutation.payload };
    const fieldEditedAt = mutation.fieldEditedAt || {};

    const clockMap = new Map<string, ExistingFieldClock>();
    for (const clock of existingClocks) {
      clockMap.set(clock.fieldName, clock);
    }

    const appliedFields: string[] = [];
    const serverWonFields: string[] = [];
    const manualFields: string[] = [];
    const updatedClocks: Array<{ fieldName: string; editedAt: Date }> = [];
    const resolvedPayload: Record<string, unknown> = {};

    let hasServerWins = false;
    let hasClientWins = false;

    for (const [field, clientVal] of Object.entries(payload)) {
      const rawTimestamp = fieldEditedAt[field] || mutation.occurredAt;
      const clientTime = new Date(rawTimestamp);
      const validClientTime = Number.isNaN(clientTime.getTime()) ? new Date(mutation.occurredAt) : clientTime;
      const serverClock = clockMap.get(field);

      if (!serverClock) {
        // Field has no existing clock -> client edit wins
        resolvedPayload[field] = clientVal;
        appliedFields.push(field);
        updatedClocks.push({ fieldName: field, editedAt: validClientTime });
        hasClientWins = true;
      } else {
        const clientMs = validClientTime.getTime();
        const serverMs = serverClock.editedAt.getTime();

        if (clientMs > serverMs) {
          // Client edit is strictly newer -> client wins
          resolvedPayload[field] = clientVal;
          appliedFields.push(field);
          updatedClocks.push({ fieldName: field, editedAt: validClientTime });
          hasClientWins = true;
        } else if (clientMs < serverMs) {
          // Server edit is strictly newer -> server wins, preserve server value
          if (serverData && field in serverData) {
            resolvedPayload[field] = serverData[field];
          }
          serverWonFields.push(field);
          hasServerWins = true;
        } else {
          // Equal timestamps -> tie breaker: deviceId -> mutationId
          if (deviceId >= serverClock.deviceId) {
            resolvedPayload[field] = clientVal;
            appliedFields.push(field);
            updatedClocks.push({ fieldName: field, editedAt: validClientTime });
            hasClientWins = true;
          } else {
            if (serverData && field in serverData) {
              resolvedPayload[field] = serverData[field];
            }
            serverWonFields.push(field);
            hasServerWins = true;
          }
        }
      }
    }

    let status: SyncMergeOutcome['status'] = 'APPLIED';
    if (hasClientWins && hasServerWins) {
      status = 'AUTO_MERGED';
    } else if (hasServerWins && !hasClientWins) {
      status = 'PARTIALLY_APPLIED';
    }

    return {
      resolvedPayload,
      outcome: {
        mutationId: mutation.id,
        status,
        appliedFields,
        serverWonFields,
        manualFields,
      },
      updatedClocks,
    };
  }
}
