import { Prisma } from '@prisma/client';
import { SyncConflict, SyncMutation } from '@core/application/ports/in/sync-use-case.port';

export type Tx = Prisma.TransactionClient;

export interface MutationHandlerContext {
  tx: Tx;
  userId: string;
  mutation: SyncMutation;
  outcome: { growthReceipt?: unknown };
}

export interface SyncMutationHandler {
  /** The mutation kind(s) this handler supports (e.g. 'deck.create', 'task.update') */
  readonly kinds: readonly string[];

  /** Execute the mutation. Returns null on success, or a SyncConflict on conflict. */
  handle(ctx: MutationHandlerContext): Promise<SyncConflict | null>;
}

/** Record a sync change after a successful mutation. */
export async function recordChange(
  tx: Tx,
  userId: string,
  entityType: string,
  entityId: string,
  operation: 'UPSERT' | 'DELETE',
  data: object | unknown[],
): Promise<void> {
  await tx.syncChange.create({
    data: { userId, entityType, entityId, operation, data: data as Prisma.InputJsonValue },
  });
}
