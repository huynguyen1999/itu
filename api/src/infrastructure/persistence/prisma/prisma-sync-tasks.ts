import { Tx, getOrCreateGrowthProfileInTx, recordSyncChange, TASK_SYNC_INCLUDE } from './prisma-sync-mutation.shared';
import {
  GrowthScalingMode,
  GrowthSourceType,
  Prisma,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';
import { SyncConflict, SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import { InvalidSyncMutationException } from '@core/domain/exceptions';
import { createUlid } from './ulid';
import { awardGrowthActivityWithReceipt, reverseGrowthActivity } from '@core/application/use-cases/growth-awards';
import { ensureStarterSkills } from '@core/application/use-cases/ensure-starter-skills';
import { REWARD_PRESETS } from '@core/application/use-cases/growth-reward-presets';
import {
  assertClientId,
  enumValue,
  fieldConflict,
  notFound,
  optionalString,
  requiredString,
  stale,
  stringArray,
} from './prisma-sync.helpers';
export { conflictingSyncFields } from './prisma-sync.helpers';


export class PrismaSyncTasks {
  readonly kinds: readonly string[] = ["task.create","task.update","task.delete","task.restore","task.reorder"];
  async applyMutation(
    tx: Tx,
    userId: string,
    mutation: SyncMutation,
    outcome: { growthReceipt?: unknown },
  ): Promise<SyncConflict | null | undefined> {
    const payload = mutation.payload;
    switch (mutation.kind) {
      case 'task.create': {
        assertClientId(mutation.entityId);
        const tagIds = stringArray(payload, 'tagIds');
        const taskListId = await this.resolveTaskListId(tx, userId, payload);
        if (tagIds.length) {
          const ownedTags = await tx.taskTag.count({ where: { userId, id: { in: tagIds } } });
          if (ownedTags !== tagIds.length) throw new InvalidSyncMutationException('Task contains an unavailable tag');
        }
        const task = await tx.task.upsert({
          where: { id: mutation.entityId },
          create: {
            id: mutation.entityId,
            userId,
            taskListId,
            sectionId: optionalString(payload, 'sectionId'),
            parentId: optionalString(payload, 'parentId'),
            title: requiredString(payload, 'title'),
            descriptionMarkdown: optionalString(payload, 'descriptionMarkdown') ?? '',
            priority: payload.priority ? enumValue(TaskPriority, payload.priority, 'priority') : TaskPriority.NONE,
            important: typeof payload.important === 'boolean' ? payload.important : false,
            urgentOverride: typeof payload.urgentOverride === 'boolean' ? payload.urgentOverride : null,
            status: payload.status ? enumValue(TaskStatus, payload.status, 'status') : TaskStatus.INBOX,
            dueAt: payload.dueAt ? new Date(payload.dueAt as string) : null,
            scheduledStartAt: payload.scheduledStartAt ? new Date(payload.scheduledStartAt as string) : null,
            scheduledEndAt: payload.scheduledEndAt ? new Date(payload.scheduledEndAt as string) : null,
            estimatedMinutes: typeof payload.estimatedMinutes === 'number' ? payload.estimatedMinutes : null,
            recurrenceRule: optionalString(payload, 'recurrenceRule'),
            sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : 0,
            tags: tagIds.length ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
          },
          update: {},
        });
        await this.createDefaultTaskGrowthRule(tx, userId, task.id);
        const syncedTask = await tx.task.findUniqueOrThrow({ where: { id: task.id }, include: TASK_SYNC_INCLUDE });
        await recordSyncChange(tx, userId, 'task', task.id, 'UPSERT', syncedTask);
        return null;
      }
      case 'task.update': {
        const task = await tx.task.findFirst({
          where: { id: mutation.entityId, userId },
          include: { tags: { include: { tag: true } } },
        });
        if (!task) return notFound(mutation, 'task');
        const conflict = fieldConflict(mutation, 'task', task);
        if (conflict) return conflict;
        if (payload.tagIds !== undefined) {
          const tagIds = stringArray(payload, 'tagIds');
          const ownedTags = await tx.taskTag.count({ where: { userId, id: { in: tagIds } } });
          if (ownedTags !== tagIds.length) throw new InvalidSyncMutationException('Task contains an unavailable tag');
          await tx.taskTagAssignment.deleteMany({ where: { taskId: task.id } });
          if (tagIds.length) {
            await tx.taskTagAssignment.createMany({ data: tagIds.map((tagId) => ({ taskId: task.id, tagId })) });
          }
        }
        const updated = await tx.task.update({
          where: { id: task.id },
          data: {
            title: optionalString(payload, 'title') ?? task.title,
            descriptionMarkdown:
              payload.descriptionMarkdown === undefined
                ? task.descriptionMarkdown
                : (optionalString(payload, 'descriptionMarkdown') ?? ''),
            taskListId: payload.taskListId === undefined ? task.taskListId : optionalString(payload, 'taskListId'),
            sectionId: payload.sectionId === undefined ? task.sectionId : optionalString(payload, 'sectionId'),
            parentId: payload.parentId === undefined ? task.parentId : optionalString(payload, 'parentId'),
            priority:
              payload.priority === undefined ? task.priority : enumValue(TaskPriority, payload.priority, 'priority'),
            important: typeof payload.important === 'boolean' ? payload.important : task.important,
            urgentOverride:
              payload.urgentOverride === undefined
                ? task.urgentOverride
                : typeof payload.urgentOverride === 'boolean'
                  ? payload.urgentOverride
                  : null,
            status: payload.status === undefined ? task.status : enumValue(TaskStatus, payload.status, 'status'),
            dueAt: payload.dueAt === undefined ? task.dueAt : payload.dueAt ? new Date(payload.dueAt as string) : null,
            scheduledStartAt:
              payload.scheduledStartAt === undefined
                ? task.scheduledStartAt
                : payload.scheduledStartAt
                  ? new Date(payload.scheduledStartAt as string)
                  : null,
            scheduledEndAt:
              payload.scheduledEndAt === undefined
                ? task.scheduledEndAt
                : payload.scheduledEndAt
                  ? new Date(payload.scheduledEndAt as string)
                  : null,
            estimatedMinutes:
              payload.estimatedMinutes === undefined
                ? task.estimatedMinutes
                : typeof payload.estimatedMinutes === 'number'
                  ? payload.estimatedMinutes
                  : null,
            recurrenceRule:
              payload.recurrenceRule === undefined ? task.recurrenceRule : optionalString(payload, 'recurrenceRule'),
            completedAt:
              payload.status === TaskStatus.COMPLETED ? new Date() : payload.status !== undefined ? null : task.completedAt,
            sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : task.sortOrder,
            version: { increment: 1 },
          },
        });
        if (task.status !== TaskStatus.COMPLETED && updated.status === TaskStatus.COMPLETED) {
          const receipt = await awardGrowthActivityWithReceipt(tx, userId, GrowthSourceType.TASK, task.id, task.title);
          if (receipt) outcome.growthReceipt = receipt;
        } else if (task.status === TaskStatus.COMPLETED && updated.status !== TaskStatus.COMPLETED) {
          await reverseGrowthActivity(tx, userId, GrowthSourceType.TASK, task.id, task.title);
        }
        const syncedTask = await tx.task.findUniqueOrThrow({ where: { id: updated.id }, include: TASK_SYNC_INCLUDE });
        await recordSyncChange(tx, userId, 'task', updated.id, 'UPSERT', syncedTask);
        return null;
      }
      case 'task.delete': {
        const task = await tx.task.findFirst({ where: { id: mutation.entityId, userId } });
        if (!task) return null;
        if (mutation.baseVersion !== undefined && mutation.baseVersion !== task.version)
          return stale(mutation, 'task', task);
        const updated = await tx.task.update({
          where: { id: task.id },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        await tx.syncChange.create({
          data: {
            userId,
            entityType: 'task',
            entityId: updated.id,
            operation: 'DELETE',
            data: { id: task.id } as unknown as Prisma.InputJsonValue,
          },
        });
        return null;
      }
      case 'task.restore': {
        const task = await tx.task.findFirst({ where: { id: mutation.entityId, userId } });
        if (!task) return notFound(mutation, 'task');
        const updated = await tx.task.update({
          where: { id: task.id },
          data: { deletedAt: null, version: { increment: 1 } },
        });
        const syncedTask = await tx.task.findUniqueOrThrow({ where: { id: updated.id }, include: TASK_SYNC_INCLUDE });
        await recordSyncChange(tx, userId, 'task', updated.id, 'UPSERT', syncedTask);
        return null;
      }
      case 'task.reorder': {
        const taskIds = stringArray(payload, 'taskIds');
        for (let index = 0; index < taskIds.length; index += 1) {
          const task = await tx.task.findFirst({ where: { id: taskIds[index], userId } });
          if (!task) continue;
          const sortOrder = index + 1;
          if (task.sortOrder === sortOrder) continue;
          const updated = await tx.task.update({
            where: { id: task.id },
            data: { sortOrder, version: { increment: 1 } },
          });
          const syncedTask = await tx.task.findUniqueOrThrow({ where: { id: updated.id }, include: TASK_SYNC_INCLUDE });
          await recordSyncChange(tx, userId, 'task', updated.id, 'UPSERT', syncedTask);
        }
        return null;
      }
      default:
        return undefined;
    }
  }

  private async resolveTaskListId(tx: Tx, userId: string, payload: Record<string, unknown>): Promise<string | null> {
    const requestedTaskListId = optionalString(payload, 'taskListId');
    if (requestedTaskListId) return requestedTaskListId;

    const existingList = await tx.taskList.findFirst({
      where: { userId, archivedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (existingList) return existingList.id;

    const createdList = await tx.taskList.create({
      data: {
        id: createUlid(),
        userId,
        title: 'Inbox',
        color: 'TEAL',
        isDefault: true,
      },
      select: { id: true },
    });
    return createdList.id;
  }

  private async createDefaultTaskGrowthRule(tx: Tx, userId: string, taskId: string): Promise<void> {
    if (!tx.growthTaskRewardDefault?.findFirst || !tx.growthRewardPresetSetting?.findUnique || !tx.growthEarningRule?.create) return;
    // `task.create` is an upsert and can be replayed under a new mutation ID.
    // Keep an existing (possibly customized) rule untouched on such retries.
    if (tx.growthEarningRule.findUnique) {
      const existingRule = await tx.growthEarningRule.findUnique({
        where: { userId_sourceType_sourceId: { userId, sourceType: GrowthSourceType.TASK, sourceId: taskId } },
        select: { id: true },
      });
      if (existingRule) return;
    }
    const profile = await getOrCreateGrowthProfileInTx(tx, userId);
    await ensureStarterSkills(tx, userId, profile.activeCycleId);
    const task = await tx.task.findFirst({ where: { id: taskId, userId }, select: { taskListId: true } });
    const include = { skillAwards: { select: { skillId: true, xpReward: true } }, itemAwards: { select: { itemId: true, quantity: true } } };
    const scopedDefault = task?.taskListId
      ? await tx.growthTaskRewardDefault.findFirst({ where: { userId, taskListId: task.taskListId, enabled: true }, include })
      : null;
    const globalDefault = await tx.growthTaskRewardDefault.findFirst({ where: { userId, taskListId: null, enabled: true }, include });
    const defaults = scopedDefault ?? globalDefault;
    if (defaults) {
      await this.createTaskGrowthRuleInTx(tx, userId, taskId, defaults.coinReward, defaults.accountXp, defaults.skillAwards, defaults.itemAwards);
      return;
    }

    const saved = await tx.growthRewardPresetSetting.findUnique({
      where: { userId_preset_sourceType: { userId, preset: profile.rewardPreset, sourceType: GrowthSourceType.TASK } },
    });
    const preset = saved
      ? { coinReward: saved.coinReward, accountXp: saved.accountXp, xpRewardPerSkill: saved.xpRewardPerSkill, scalingMode: saved.scalingMode, maxRewardCap: saved.maxRewardCap }
      : REWARD_PRESETS[profile.rewardPreset]?.[GrowthSourceType.TASK];
    if (!preset) return;
    const skills = await tx.growthSkill.findMany({ where: { userId, archivedAt: null, starterKey: 'attribute-general' }, select: { id: true } });
    await this.createTaskGrowthRuleInTx(
      tx,
      userId,
      taskId,
      preset.coinReward,
      preset.accountXp,
      skills.map((skill) => ({ skillId: skill.id, xpReward: preset.xpRewardPerSkill })),
      [],
      preset.scalingMode,
      preset.maxRewardCap,
    );
  }

  private async createTaskGrowthRuleInTx(
    tx: Tx,
    userId: string,
    taskId: string,
    coinReward: number,
    accountXp: number,
    skillAwards: Array<{ skillId: string; xpReward: number }>,
    itemAwards: Array<{ itemId: string; quantity: number }>,
    scalingMode: GrowthScalingMode = GrowthScalingMode.FIXED,
    maxRewardCap: number | null = null,
  ): Promise<void> {
    const rule = await tx.growthEarningRule.create({
      data: {
        id: createUlid(), userId, sourceType: GrowthSourceType.TASK, sourceId: taskId,
        coinReward: Math.max(0, Math.trunc(coinReward)), accountXp: Math.max(0, Math.trunc(accountXp)),
        scalingMode, maxRewardCap: maxRewardCap == null ? null : Math.max(1, Math.trunc(maxRewardCap)), enabled: true,
      },
    });
    const positiveSkills = skillAwards.filter((award) => award.xpReward > 0);
    if (positiveSkills.length) {
      await tx.growthEarningRuleSkill.createMany({ data: positiveSkills.map((award) => ({ ruleId: rule.id, skillId: award.skillId, xpReward: Math.max(0, Math.trunc(award.xpReward)) })) });
    }
    const positiveItems = itemAwards.filter((award) => award.quantity > 0);
    if (positiveItems.length) {
      await tx.growthEarningRuleItem.createMany({ data: positiveItems.map((award) => ({ ruleId: rule.id, itemId: award.itemId, quantity: Math.max(1, Math.trunc(award.quantity)) })) });
    }
  }

}

