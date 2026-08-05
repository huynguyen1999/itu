import { Prisma } from '@prisma/client';
import { createUlid } from './ulid';

export type Tx = Prisma.TransactionClient;

export async function getOrCreateGrowthProfileInTx(tx: Tx, userId: string) {
  const existing = await tx.growthProfile.findUnique({ where: { userId } });
  if (existing) return existing;
  const cycle = await tx.growthCycle.create({ data: { id: createUlid(), userId } });
  return tx.growthProfile.create({ data: { id: createUlid(), userId, activeCycleId: cycle.id } });
}

export const TASK_SYNC_INCLUDE = {
  taskList: true,
  section: true,
  tags: { include: { tag: true } },
  reminders: true,
  children: { select: { id: true, status: true } },
} satisfies Prisma.TaskInclude;

export const HABIT_SYNC_INCLUDE = {
  timeBlock: true,
  tags: { include: { tag: true } },
  reminders: true,
  checklistItems: true,
  taskTemplateConfig: true,
  commitmentPolicy: true,
} satisfies Prisma.HabitInclude;

export function validFocusMinutes(
  session: Pick<Prisma.FocusSessionGetPayload<{}>, 'startedAt' | 'completedAt' | 'adjustedStartedAt' | 'adjustedCompletedAt' | 'accumulatedPauseSecs'>,
): number {
  const effectiveStartedAt = session.adjustedStartedAt ?? session.startedAt;
  const effectiveCompletedAt = session.adjustedCompletedAt ?? session.completedAt;
  if (!effectiveCompletedAt) return 0;
  const elapsedSeconds = Math.floor((effectiveCompletedAt.getTime() - effectiveStartedAt.getTime()) / 1000);
  return Math.max(0, Math.floor((elapsedSeconds - Math.max(0, session.accumulatedPauseSecs ?? 0)) / 60));
}

export async function recordSyncChange(
  tx: Tx,
  userId: string,
  entityType: string,
  entityId: string,
  operation: 'UPSERT' | 'DELETE',
  data: object | unknown[],
): Promise<void> {
  await tx.syncChange.create({
    data: {
      userId,
      entityType,
      entityId,
      operation,
      data: data as Prisma.InputJsonValue,
    },
  });
}
