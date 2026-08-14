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
