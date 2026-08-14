import { FocusPhase, FocusSessionStatus } from '@prisma/client';
import { settleFocusGrowth } from './prisma-focus.persistence';
import { recordSyncChange, Tx } from './prisma-sync-mutation.shared';

export async function completeFocusedTaskSession(
  tx: Tx,
  userId: string,
  taskId: string,
  completedAt: Date,
) {
  const session = await tx.focusSession.findFirst({
    where: { userId, taskId, phase: FocusPhase.WORK, status: FocusSessionStatus.ACTIVE },
  });
  if (!session) return null;

  const updated = await tx.focusSession.update({
    where: { id: session.id },
    data: {
      status: FocusSessionStatus.COMPLETED,
      completedAt,
      version: { increment: 1 },
    },
  });
  const growthReceipt = await settleFocusGrowth(tx, userId, session, updated);
  await recordSyncChange(tx, userId, 'focussession', updated.id, 'UPSERT', updated);
  return { session: updated, growthReceipt };
}
