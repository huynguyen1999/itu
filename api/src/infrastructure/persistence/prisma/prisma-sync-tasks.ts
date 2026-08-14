import { Tx, getOrCreateGrowthProfileInTx, recordSyncChange, TASK_SYNC_INCLUDE } from './prisma-sync-mutation.shared';
import {
  GrowthScalingMode,
  GrowthSourceType,
  Prisma,
  ReminderRelativeTo,
  ReminderStatus,
  ReminderType,
  ScheduledJobStatus,
  ScheduledJobType,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';
import { SyncConflict, SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import { ExistingFieldClock, SyncMergeResolver } from './sync-merge-resolver';
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
import {
  calculateRelativeReminderAt,
  parseTaskDate,
  resolveReminderAnchor,
  validateTaskSchedule,
} from '@core/application/use-cases/task-date-rules';


export class PrismaSyncTasks {
  private readonly mergeResolver = new SyncMergeResolver();
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
        const dueAt = parseTaskDate(optionalString(payload, 'dueAt')) ?? null;
        const scheduledStartAt = parseTaskDate(optionalString(payload, 'scheduledStartAt')) ?? null;
        const scheduledEndAt = parseTaskDate(optionalString(payload, 'scheduledEndAt')) ?? null;
        validateTaskSchedule({ dueAt, scheduledStartAt, scheduledEndAt });
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
            dueAt,
            scheduledStartAt,
            scheduledEndAt,
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
        const scheduleResolution = await this.resolveScheduleClocks(tx, userId, mutation, task);
        const clockedFields = scheduleResolution.clockedFields;
        const remainingPayload = Object.fromEntries(
          Object.entries(payload).filter(([field]) => !clockedFields.has(field)),
        );
        if (Object.keys(remainingPayload).length > 0) {
          const conflict = fieldConflict({ ...mutation, payload: remainingPayload }, 'task', task);
          if (conflict) return conflict;
        }
        const resolved = scheduleResolution.values;
        const dueAt = resolved.dueAt !== undefined
          ? resolved.dueAt
          : payload.dueAt === undefined ? task.dueAt : parseTaskDate(optionalString(payload, 'dueAt')) ?? null;
        const scheduledStartAt = resolved.scheduledStartAt !== undefined
          ? resolved.scheduledStartAt
          : payload.scheduledStartAt === undefined ? task.scheduledStartAt : parseTaskDate(optionalString(payload, 'scheduledStartAt')) ?? null;
        const scheduledEndAt = resolved.scheduledEndAt !== undefined
          ? resolved.scheduledEndAt
          : payload.scheduledEndAt === undefined ? task.scheduledEndAt : parseTaskDate(optionalString(payload, 'scheduledEndAt')) ?? null;
        validateTaskSchedule({ dueAt, scheduledStartAt, scheduledEndAt });
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
            dueAt,
            scheduledStartAt,
            scheduledEndAt,
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
        for (const clock of scheduleResolution.clocks) {
          await tx.syncFieldClock.upsert({
            where: { userId_entityType_entityId_fieldName: { userId, entityType: 'task', entityId: task.id, fieldName: clock.fieldName } },
            create: { userId, entityType: 'task', entityId: task.id, fieldName: clock.fieldName, editedAt: clock.editedAt, deviceId: mutation.serverDeviceId ?? 'server', mutationId: mutation.id },
            update: { editedAt: clock.editedAt, deviceId: mutation.serverDeviceId ?? 'server', mutationId: mutation.id },
          });
        }
        if (payload.dueAt !== undefined || payload.scheduledStartAt !== undefined) {
          await this.rescheduleRelativeReminders(tx, userId, task.id, { dueAt, scheduledStartAt });
        }
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

  private async resolveScheduleClocks(
    tx: Tx,
    userId: string,
    mutation: SyncMutation,
    task: Record<string, unknown>,
  ): Promise<{
    clockedFields: Set<string>;
    values: Record<string, Date | null>;
    clocks: Array<{ fieldName: string; editedAt: Date }>;
  }> {
    const payload = mutation.payload;
    const editedAt = mutation.fieldEditedAt ?? {};
    const clockedFields = new Set<string>();
    if (editedAt.dueAt !== undefined && payload.dueAt !== undefined) clockedFields.add('dueAt');
    const startTime = editedAt.scheduledStartAt;
    const endTime = editedAt.scheduledEndAt;
    const startClocked = startTime !== undefined && payload.scheduledStartAt !== undefined;
    const endClocked = endTime !== undefined && payload.scheduledEndAt !== undefined;
    if (startClocked || endClocked) {
      if (startClocked && endClocked && startTime !== endTime) {
        throw new InvalidSyncMutationException('scheduledStartAt and scheduledEndAt must share one edit timestamp');
      }
      clockedFields.add('scheduledStartAt');
      clockedFields.add('scheduledEndAt');
    }
    if (clockedFields.size === 0) return { clockedFields, values: {}, clocks: [] };

    const clockRows = await tx.syncFieldClock.findMany({
      where: { userId, entityType: 'task', entityId: mutation.entityId, fieldName: { in: [...clockedFields] } },
    });
    const clockMap = new Map(clockRows.map((row) => [row.fieldName, row]));

    const unitPayload: Record<string, unknown> = {};
    const unitEditedAt: Record<string, string> = {};
    const unitClocks: ExistingFieldClock[] = [];
    const addUnit = (field: string, value: unknown, timestamp: string, clock?: { editedAt: Date; deviceId: string; mutationId: string }) => {
      unitPayload[field] = value;
      unitEditedAt[field] = timestamp;
      if (clock) unitClocks.push({ fieldName: field, editedAt: clock.editedAt, deviceId: clock.deviceId, mutationId: clock.mutationId });
    };

    if (clockedFields.has('dueAt')) {
      addUnit('dueAt', payload.dueAt, editedAt.dueAt as string, clockMap.get('dueAt'));
    }
    if (clockedFields.has('scheduledStartAt')) {
      const startClock = clockMap.get('scheduledStartAt');
      const endClock = clockMap.get('scheduledEndAt');
      const serverClock =
        startClock && endClock
          ? (startClock.editedAt.getTime() >= endClock.editedAt.getTime() ? startClock : endClock)
          : (startClock ?? endClock);
      addUnit(
        'scheduledRange',
        {
          scheduledStartAt: payload.scheduledStartAt ?? task.scheduledStartAt,
          scheduledEndAt: payload.scheduledEndAt ?? task.scheduledEndAt,
        },
        startTime ?? endTime,
        serverClock,
      );
    }

    const result = this.mergeResolver.resolveMutationFields(
      { ...mutation, payload: unitPayload, fieldEditedAt: unitEditedAt },
      'task',
      unitClocks,
      { dueAt: task.dueAt, scheduledRange: { scheduledStartAt: task.scheduledStartAt, scheduledEndAt: task.scheduledEndAt } },
      mutation.serverDeviceId ?? 'server',
    );

    const values: Record<string, Date | null> = {};
    const clocks: Array<{ fieldName: string; editedAt: Date }> = [];
    for (const [field, value] of Object.entries(result.resolvedPayload)) {
      if (field === 'scheduledRange') {
        const range = value as { scheduledStartAt: unknown; scheduledEndAt: unknown };
        values.scheduledStartAt = parseTaskDate(range.scheduledStartAt as Date | string | null) ?? null;
        values.scheduledEndAt = parseTaskDate(range.scheduledEndAt as Date | string | null) ?? null;
        const rangeClock = result.updatedClocks.find((entry) => entry.fieldName === 'scheduledRange');
        if (rangeClock) {
          clocks.push({ fieldName: 'scheduledStartAt', editedAt: rangeClock.editedAt });
          clocks.push({ fieldName: 'scheduledEndAt', editedAt: rangeClock.editedAt });
        }
      } else {
        values[field] = parseTaskDate(value as Date | string | null) ?? null;
        const unitClock = result.updatedClocks.find((entry) => entry.fieldName === field);
        if (unitClock) clocks.push(unitClock);
      }
    }
    return { clockedFields, values, clocks };
  }

  private async rescheduleRelativeReminders(
    tx: Tx,
    userId: string,
    taskId: string,
    task: { dueAt: Date | null; scheduledStartAt: Date | null },
  ): Promise<void> {
    const reminders = await tx.taskReminder.findMany({
      where: {
        userId,
        taskId,
        type: ReminderType.RELATIVE,
        status: { in: [ReminderStatus.SCHEDULED, ReminderStatus.SNOOZED] },
        deliveredAt: null,
      },
    });
    for (const reminder of reminders) {
      const anchor = resolveReminderAnchor(task, reminder.relativeTo as ReminderRelativeTo | null);
      if (!anchor) {
        if (reminder.scheduledJobId) {
          await tx.scheduledJob.updateMany({ where: { id: reminder.scheduledJobId }, data: { status: ScheduledJobStatus.CANCELED } });
        }
        await tx.taskReminder.update({ where: { id: reminder.id }, data: { status: ReminderStatus.CANCELED } });
        continue;
      }
      const remindAt = calculateRelativeReminderAt(task, reminder);
      if (reminder.scheduledJobId) {
        await tx.scheduledJob.updateMany({
          where: { id: reminder.scheduledJobId, status: { notIn: [ScheduledJobStatus.COMPLETED, ScheduledJobStatus.CANCELED] } },
          data: { status: ScheduledJobStatus.CANCELED },
        });
      }
      const jobId = createUlid();
      await tx.scheduledJob.create({
        data: { id: jobId, userId, type: ScheduledJobType.TASK_REMINDER, payload: { reminderId: reminder.id }, runAt: remindAt },
      });
      await tx.taskReminder.update({
        where: { id: reminder.id },
        data: { remindAt, scheduledJobId: jobId, status: ReminderStatus.SCHEDULED },
      });
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
