import { Injectable } from '@nestjs/common';
import { IProductivityRepository } from '@core/application/ports/out/repositories.port';
import { PrismaService } from './prisma.service';
import { createUlid } from './ulid';
import { GrowthSourceType, Prisma, ReminderStatus, ScheduledJobStatus, TaskStatus } from '@prisma/client';
import { DomainException, EntityNotFoundException } from '@core/domain/exceptions';
import { REWARD_PRESETS } from '@core/application/use-cases/growth-reward-presets';
import { ensureStarterSkills } from '@core/application/use-cases/ensure-starter-skills';
import { awardGrowthActivityWithReceipt, reverseGrowthActivity } from '@core/application/use-cases/growth-awards';
import { PrismaProductivityHabits } from './prisma-productivity-habits';
import { ONBOARDING_STATE, TASK_VIEW_FILTERS } from '@core/application/constants/productivity.constants';

@Injectable()
export class PrismaProductivityRepository implements IProductivityRepository {
  private lastGeneratedTaskSortOrder = 0;

  constructor(
    private readonly db: PrismaService,
    private readonly habits: PrismaProductivityHabits,
  ) {}

  async recordSyncChange(
    userId: string,
    entityType: string,
    entityId: string,
    operation: 'UPSERT' | 'DELETE',
    data: object,
  ) {
    const change = await this.db.syncChange.create({
      data: {
        userId,
        entityType,
        entityId,
        operation,
        data: data as Prisma.InputJsonValue,
      },
    });
    return { cursor: change.cursor };
  }

  // Task Lists
  async listTaskLists(userId: string, filter?: any) {
    const take = filter?.limit ? Math.min(filter.limit, 50) : 50;

    const lists = (await this.db.taskList.findMany({
      where: { userId, archivedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
      ...(filter?.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
      ...(filter?.includeTaskCount
        ? { include: { _count: { select: { tasks: { where: { deletedAt: null } } } } } }
        : {}),
    })) as Array<{ _count?: { tasks: number } } & Record<string, unknown>>;
    if (!filter?.includeTaskCount) return lists;
    return lists.map(({ _count, ...list }) => ({ ...list, taskCount: _count?.tasks ?? 0 }));
  }

  async findTaskListById(userId: string, id: string) {
    return this.db.taskList.findFirst({ where: { id, userId } });
  }

  async createTaskList(userId: string, data: any) {
    return this.db.taskList.create({
      data: {
        id: createUlid(),
        userId,
        title: data.title,
        color: data.color ?? 'TEAL',
        isDefault: data.isDefault ?? false,
      },
    });
  }

  async updateTaskList(userId: string, id: string, data: any) {
    return this.db.taskList.update({
      where: { id },
      data: {
        title: data.title,
        color: data.color,
        isDefault: data.isDefault,
      },
    });
  }

  async deleteTaskList(userId: string, id: string) {
    const deleted = await this.db.taskList.deleteMany({ where: { id, userId, isDefault: false } });
    return deleted.count > 0;
  }

  // Sections
  async listSections(userId: string, taskListId?: string, filter?: any) {
    const take = filter?.limit ? Math.min(filter.limit, 50) : 50;

    return this.db.taskSection.findMany({
      where: { userId, ...(taskListId ? { taskListId } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take,
      ...(filter?.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
    });
  }

  async createSection(userId: string, data: any) {
    const last = await this.db.taskSection.aggregate({
      where: { userId, taskListId: data.taskListId },
      _max: { sortOrder: true },
    });
    return this.db.taskSection.create({
      data: {
        id: createUlid(),
        userId,
        taskListId: data.taskListId,
        title: data.title,
        sortOrder: (last._max?.sortOrder ?? 0) + 1,
      },
    });
  }

  async updateSection(userId: string, id: string, data: any) {
    return this.db.taskSection.update({
      where: { id },
      data: { title: data.title, sortOrder: data.sortOrder },
    });
  }

  async deleteSection(userId: string, id: string) {
    const deleted = await this.db.taskSection.deleteMany({ where: { id, userId } });
    return deleted.count > 0;
  }

  // Tasks
  async listTasks(userId: string, filter?: any) {
    const where: Prisma.TaskWhereInput = {
      userId,
      deletedAt: null,
    };

    if (filter) {
      if (filter.view === TASK_VIEW_FILTERS.TODAY) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        where.AND = [
          {
            OR: [
              { dueAt: { gte: startOfDay, lte: endOfDay } },
              { scheduledStartAt: { gte: startOfDay, lte: endOfDay } },
              // Overdue tasks: due before today and still open. Keeps the
              // "today" view (home page + Today planning view) in sync with the
              // web client's cache, which already treats overdue as part of today.
              {
                dueAt: { lt: startOfDay },
                status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELED, TaskStatus.ARCHIVED] },
              },
              { status: TaskStatus.INBOX },
            ],
          },
        ];
      } else if (filter.view === TASK_VIEW_FILTERS.INBOX) {
        where.status = TaskStatus.INBOX;
      } else if (filter.taskListId) {
        where.taskListId = filter.taskListId;
      } else if (filter.sectionId) {
        where.sectionId = filter.sectionId;
      } else if (filter.tagId) {
        where.tags = { some: { tagId: filter.tagId } };
      }

      // Search query support - case-insensitive substring matching
      if (filter.q && filter.q.trim()) {
        const searchCondition = {
          OR: [
            { title: { contains: filter.q.trim(), mode: 'insensitive' as Prisma.QueryMode } },
            { descriptionMarkdown: { contains: filter.q.trim(), mode: 'insensitive' as Prisma.QueryMode } },
          ],
        };

        if (where.AND) {
          (where.AND as any[]).push(searchCondition);
        } else {
          where.AND = [searchCondition];
        }
      }
    }

    const take = filter?.limit ? Math.min(filter.limit, 100) : 50;

    const items = await this.db.task.findMany({
      where,
      include: { tags: { include: { tag: true } }, reminders: true },
      orderBy: [{ createdAt: 'desc' }, { sortOrder: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(filter?.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
    });

    const hasNextPage = items.length > take;
    const data = hasNextPage ? items.slice(0, take) : items;
    const last = data[data.length - 1];
    const nextCursor =
      hasNextPage && last
        ? Buffer.from(JSON.stringify({ id: last.id, createdAt: last.createdAt.toISOString() })).toString('base64url')
        : null;

    return { data, hasNextPage, nextCursor };
  }

  async findTaskById(userId: string, id: string) {
    return this.db.task.findFirst({ where: { id, userId } });
  }

  async createTask(userId: string, data: any) {
    return this.db.$transaction(async (tx) => {
      const tagIds: string[] = Array.isArray(data.tagIds)
        ? Array.from(
            new Set<string>(data.tagIds.filter((tagId: unknown): tagId is string => typeof tagId === 'string')),
          )
        : [];
      if (tagIds.length) {
        const ownedTags = await tx.taskTag.count({ where: { userId, id: { in: tagIds } } });
        if (ownedTags !== tagIds.length) throw new DomainException('Task contains an unavailable tag', 'INVALID_TASK_TAG', 400);
      }

      const last = await tx.task.aggregate({
        where: { userId },
        _max: { sortOrder: true },
      });
      const sortOrder = Math.max((last._max?.sortOrder ?? 0) + 1, this.nextTaskSortOrder());
      const task = await tx.task.create({
        data: {
          id: createUlid(),
          userId,
          title: data.title,
          descriptionMarkdown: data.descriptionMarkdown ?? '',
          taskListId: data.taskListId,
          sectionId: data.sectionId,
          priority: data.priority,
          important: data.important,
          dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
          sortOrder,
          tags: tagIds.length ? { createMany: { data: tagIds.map((tagId) => ({ tagId })) } } : undefined,
        },
        include: { tags: { include: { tag: true } }, reminders: true },
      });

      await this.createDefaultTaskGrowthRule(tx, userId, task.id);

      return task;
    });
  }

  private nextTaskSortOrder() {
    const now = Date.now();
    this.lastGeneratedTaskSortOrder = Math.max(this.lastGeneratedTaskSortOrder + 1, now);
    return this.lastGeneratedTaskSortOrder;
  }

  private async createDefaultTaskGrowthRule(
    tx: Prisma.TransactionClient,
    userId: string,
    taskId: string,
  ): Promise<void> {
    const profile = await this.ensureGrowthProfile(tx, userId);
    const task = await tx.task.findFirst({ where: { id: taskId, userId }, select: { taskListId: true } });
    const scopedDefault = task?.taskListId
      ? await tx.growthTaskRewardDefault.findFirst({
          where: { userId, taskListId: task.taskListId, enabled: true },
          include: {
            skillAwards: { select: { skillId: true, xpReward: true } },
            itemAwards: { select: { itemId: true, quantity: true } },
          },
        })
      : null;
    const globalDefault = await tx.growthTaskRewardDefault.findFirst({
      where: { userId, taskListId: null, enabled: true },
      include: {
        skillAwards: { select: { skillId: true, xpReward: true } },
        itemAwards: { select: { itemId: true, quantity: true } },
      },
    });
    const defaults = scopedDefault ?? globalDefault;

    if (defaults) {
      await this.createTaskGrowthRuleWithSkillAwards(
        tx,
        userId,
        taskId,
        defaults.coinReward,
        defaults.accountXp,
        defaults.skillAwards,
        defaults.itemAwards,
      );
      return;
    }

    const saved = await tx.growthRewardPresetSetting.findUnique({
      where: {
        userId_preset_sourceType: {
          userId,
          preset: profile.rewardPreset,
          sourceType: GrowthSourceType.TASK,
        },
      },
    });
    const def = saved
      ? {
          coinReward: saved.coinReward,
          accountXp: saved.accountXp,
          xpRewardPerSkill: saved.xpRewardPerSkill,
          scalingMode: saved.scalingMode,
          maxRewardCap: saved.maxRewardCap ?? undefined,
        }
      : REWARD_PRESETS[profile.rewardPreset]?.[GrowthSourceType.TASK];
    if (!def) return;

    const skills = await tx.growthSkill.findMany({
      where: { userId, archivedAt: null, starterKey: 'attribute-general' },
      select: { id: true },
    });
    await this.createTaskGrowthRuleWithSkillAwards(
      tx,
      userId,
      taskId,
      def.coinReward,
      def.accountXp,
      skills.map((skill) => ({ skillId: skill.id, xpReward: def.xpRewardPerSkill })),
      [],
    );
  }

  private async ensureGrowthProfile(tx: Prisma.TransactionClient, userId: string) {
    let profile = await tx.growthProfile.findUnique({ where: { userId } });
    if (!profile) {
      const cycle = await tx.growthCycle.create({ data: { id: createUlid(), userId } });
      profile = await tx.growthProfile.create({
        data: {
          id: createUlid(),
          userId,
          activeCycleId: cycle.id,
          onboardingState: ONBOARDING_STATE.COMPLETED,
        },
      });
    }
    await ensureStarterSkills(tx, userId, profile.activeCycleId);
    return profile;
  }

  private async createTaskGrowthRuleWithSkillAwards(
    tx: Prisma.TransactionClient,
    userId: string,
    taskId: string,
    coinReward: number,
    accountXp: number,
    skillAwards: Array<{ skillId: string; xpReward: number }>,
    itemAwards: Array<{ itemId: string; quantity: number }>,
  ): Promise<void> {
    const rule = await tx.growthEarningRule.create({
      data: {
        id: createUlid(),
        userId,
        sourceType: GrowthSourceType.TASK,
        sourceId: taskId,
        coinReward,
        accountXp,
        scalingMode: 'FIXED',
        maxRewardCap: null,
        enabled: true,
      },
    });

    const positiveAwards = skillAwards.filter((award) => award.xpReward > 0);
    if (positiveAwards.length) {
      await tx.growthEarningRuleSkill.createMany({
        data: positiveAwards.map((award) => ({
          ruleId: rule.id,
          skillId: award.skillId,
          xpReward: award.xpReward,
        })),
      });
    }
    const positiveItems = itemAwards.filter((award) => award.quantity > 0);
    if (positiveItems.length) {
      await tx.growthEarningRuleItem.createMany({
        data: positiveItems.map((award) => ({
          ruleId: rule.id,
          itemId: award.itemId,
          quantity: award.quantity,
        })),
      });
    }
  }

  async updateTask(userId: string, id: string, data: any) {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.task.findFirst({ where: { id, userId } });
      if (!existing) return null;
      const expectedVersion = typeof data.version === 'number' ? data.version : undefined;
      if (expectedVersion !== undefined && expectedVersion !== existing.version) {
        throw new DomainException('Task has changed; refresh before retrying');
      }
      const { version: _version, ...taskData } = data;
      let updated;
      if (expectedVersion !== undefined) {
        const result = await tx.task.updateMany({ where: { id, userId, version: expectedVersion }, data: { ...taskData, version: { increment: 1 } } });
        if (!result.count) throw new DomainException('Task has changed; refresh before retrying');
        updated = await tx.task.findFirst({ where: { id, userId } });
        if (!updated) return null;
      } else {
        updated = await tx.task.update({ where: { id }, data: { ...taskData, version: { increment: 1 } } });
      }
      let growthReceipt = null;
      if (existing.status !== TaskStatus.COMPLETED && updated.status === TaskStatus.COMPLETED) {
        growthReceipt = await awardGrowthActivityWithReceipt(
          tx,
          userId,
          GrowthSourceType.TASK,
          updated.id,
          updated.title,
        );
      } else if (existing.status === TaskStatus.COMPLETED && updated.status !== TaskStatus.COMPLETED) {
        await reverseGrowthActivity(tx, userId, GrowthSourceType.TASK, updated.id, updated.title);
      }
      await tx.syncChange.create({
        data: {
          userId,
          entityType: 'task',
          entityId: updated.id,
          operation: 'UPSERT',
          data: updated as unknown as Prisma.InputJsonValue,
        },
      });
      return { ...updated, growthReceipt };
    });
  }

  async deleteTask(userId: string, id: string) {
    const deleted = await this.db.task.deleteMany({ where: { id, userId } });
    return deleted.count > 0;
  }

  async restoreTask(userId: string, id: string) {
    return this.db.task.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  // Task Tags & Notifications
  async listTaskTags(userId: string) {
    return this.db.taskTag.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
  }

  async createTaskTag(userId: string, data: any) {
    return this.db.taskTag.create({
      data: {
        id: createUlid(),
        userId,
        name: data.name,
        color: data.color ?? 'BLUE',
      },
    });
  }

  async listNotifications(userId: string, filter?: any) {
    const take = filter?.limit ? Math.min(filter.limit, 50) : 50;

    return this.db.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take,
      ...(filter?.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
    });
  }

  async markAllNotificationsRead(userId: string) {
    const updated = await this.db.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return updated.count > 0;
  }

  async markNotificationRead(userId: string, id: string) {
    const updated = await this.db.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    return updated.count > 0;
  }

  // ─── Habits & Focus (delegated to PrismaProductivityHabits) ─────────────────

  async listFocusPresets(userId: string) {
    return this.habits.listFocusPresets(userId);
  }
  async findFocusPresetById(userId: string, id: string) {
    return this.habits.findFocusPresetById(userId, id);
  }
  async createFocusPreset(userId: string, data: any) {
    return this.habits.createFocusPreset(userId, data);
  }
  async updateFocusPreset(userId: string, id: string, data: any) {
    return this.habits.updateFocusPreset(userId, id, data);
  }
  async deleteFocusPreset(userId: string, id: string) {
    return this.habits.deleteFocusPreset(userId, id);
  }
  async listFocusSessions(userId: string, filter?: any) {
    return this.habits.listFocusSessions(userId, filter);
  }
  async findFocusSessionById(userId: string, id: string) {
    return this.habits.findFocusSessionById(userId, id);
  }
  async findActiveFocusSession(userId: string) {
    return this.habits.findActiveFocusSession(userId);
  }
  async createFocusSession(userId: string, data: any) {
    return this.habits.createFocusSession(userId, data);
  }
  async updateFocusSession(userId: string, id: string, data: any) {
    return this.habits.updateFocusSession(userId, id, data);
  }

  async listFocusSounds(userId: string) {
    return this.db.focusSound.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async findFocusSoundById(userId: string, id: string) {
    return this.db.focusSound.findFirst({ where: { id, userId } });
  }

  async findFocusSoundByStorageKey(userId: string, storageKey: string) {
    return this.db.focusSound.findFirst({ where: { storageKey, userId } });
  }

  async createFocusSound(userId: string, data: any) {
    return this.db.focusSound.create({
      data: {
        id: data.id ?? createUlid(),
        userId,
        name: data.name,
        originalName: data.originalName,
        storageKey: data.storageKey,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        durationSeconds: data.durationSeconds ?? null,
      },
    });
  }

  async updateFocusSound(userId: string, id: string, data: any) {
    const sound = await this.db.focusSound.findFirst({ where: { id, userId } });
    if (!sound) return null;
    return this.db.focusSound.update({
      where: { id },
      data,
    });
  }

  async deleteFocusSound(userId: string, id: string) {
    const sound = await this.db.focusSound.findFirst({ where: { id, userId } });
    if (!sound) return null;
    await this.db.focusSound.delete({ where: { id } });
    return sound;
  }

  async listFocusSoundPreferences(userId: string) {
    return this.db.focusSoundPreference.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { soundKey: 'asc' }],
    });
  }

  async upsertFocusSoundPreference(userId: string, soundKey: string, data: any) {
    return this.db.focusSoundPreference.upsert({
      where: { userId_soundKey: { userId, soundKey } },
      create: {
        id: createUlid(),
        userId,
        soundKey,
        enabled: data.enabled ?? true,
        sortOrder: data.sortOrder ?? 0,
        volume: data.volume ?? 55,
      },
      update: {
        enabled: data.enabled,
        sortOrder: data.sortOrder,
        volume: data.volume,
      },
    });
  }
  async listTimeBlocks(userId: string) {
    return this.habits.listTimeBlocks(userId);
  }
  async createTimeBlock(userId: string, data: any) {
    return this.habits.createTimeBlock(userId, data);
  }
  async updateTimeBlock(userId: string, id: string, data: any) {
    return this.habits.updateTimeBlock(userId, id, data);
  }
  async deleteTimeBlock(userId: string, id: string) {
    return this.habits.deleteTimeBlock(userId, id);
  }
  async listHabits(userId: string, includeArchived = false) {
    return this.habits.listHabits(userId, includeArchived);
  }
  async findHabitById(userId: string, id: string) {
    return this.habits.findHabitById(userId, id);
  }
  async createHabit(userId: string, data: any) {
    return this.habits.createHabit(userId, data);
  }
  async updateHabit(userId: string, id: string, data: any) {
    return this.habits.updateHabit(userId, id, data);
  }
  async deleteHabit(userId: string, id: string) {
    return this.habits.deleteHabit(userId, id);
  }
  async listHabitOccurrences(userId: string, filter?: any) {
    return this.habits.listHabitOccurrences(userId, filter);
  }
  async findHabitOccurrenceById(userId: string, id: string) {
    return this.habits.findHabitOccurrenceById(userId, id);
  }
  async upsertHabitOccurrence(userId: string, data: any) {
    return this.habits.upsertHabitOccurrence(userId, data);
  }

  async getHabitCommitmentPolicy(userId: string, habitId: string) {
    return this.habits.getHabitCommitmentPolicy(userId, habitId);
  }

  async upsertHabitCommitmentPolicy(userId: string, habitId: string, data: any) {
    return this.habits.upsertHabitCommitmentPolicy(userId, habitId, data);
  }

  async evaluateHabitCommitment(userId: string, occurrenceId: string, now?: Date, idempotencyKey?: string) {
    return this.habits.evaluateHabitCommitment(userId, occurrenceId, now, idempotencyKey);
  }

  async excuseHabitCommitment(userId: string, occurrenceId: string, idempotencyKey?: string) {
    return this.habits.excuseHabitCommitment(userId, occurrenceId, idempotencyKey);
  }

  async reorderTasks(userId: string, taskIds: string[]) {
    const uniqueIds = [...new Set(taskIds)];
    if (uniqueIds.length !== taskIds.length) throw new DomainException('Task order contains duplicate IDs');
    const owned = await this.db.task.count({ where: { userId, id: { in: uniqueIds } } });
    if (owned !== uniqueIds.length) throw new DomainException('Task order contains an unavailable task');
    await this.db.$transaction(
      uniqueIds.map((id, index) =>
        this.db.task.update({
          where: { id },
          data: { sortOrder: index + 1, version: { increment: 1 } },
        }),
      ),
    );
    return { taskIds: uniqueIds };
  }

  async createReminder(userId: string, taskId: string, input: any) {
    const task = await this.findTaskById(userId, taskId);
    if (!task) throw new EntityNotFoundException('Task', taskId);
    if (
      task.status === TaskStatus.COMPLETED ||
      task.status === TaskStatus.CANCELED ||
      task.status === TaskStatus.ARCHIVED
    ) {
      throw new DomainException('Reminders require an active task', 'TASK_NOT_ACTIVE', 422);
    }
    const reminderId = createUlid();
    const jobId = createUlid();
    const remindAt = new Date(input.remindAt);
    return this.db.$transaction(async (tx) => {
      await tx.scheduledJob.create({
        data: {
          id: jobId,
          userId,
          type: 'TASK_REMINDER' as any,
          payload: { reminderId },
          runAt: remindAt,
        },
      });
      return tx.taskReminder.create({
        data: {
          id: reminderId,
          userId,
          taskId,
          remindAt,
          persistent: input.persistent,
          scheduledJobId: jobId,
        },
      });
    });
  }

  async reminderAction(userId: string, id: string, action: 'snooze' | 'dismiss', remindAt?: string) {
    const reminder = await this.db.taskReminder.findFirst({ where: { id, userId } });
    if (!reminder) throw new EntityNotFoundException('Reminder', id);
    return this.db.$transaction(async (tx) => {
      if (reminder.scheduledJobId) {
        await tx.scheduledJob.updateMany({
          where: {
            id: reminder.scheduledJobId,
            status: { notIn: [ScheduledJobStatus.COMPLETED, ScheduledJobStatus.CANCELED] },
          },
          data: { status: ScheduledJobStatus.CANCELED },
        });
      }
      if (action === 'dismiss') {
        return tx.taskReminder.update({ where: { id }, data: { status: ReminderStatus.DISMISSED } });
      }
      const nextRemindAt = remindAt ? new Date(remindAt) : new Date(Date.now() + 15 * 60 * 1000);
      const newJobId = createUlid();
      await tx.scheduledJob.create({
        data: {
          id: newJobId,
          userId,
          type: 'TASK_REMINDER' as any,
          payload: { reminderId: id },
          runAt: nextRemindAt,
        },
      });
      return tx.taskReminder.update({
        where: { id },
        data: {
          status: ReminderStatus.SNOOZED,
          remindAt: nextRemindAt,
          scheduledJobId: newJobId,
        },
      });
    });
  }

  // ─── Habits & Focus actions (delegated) ──────────────────────────────────

  async focusAction(userId: string, sessionId: string, action: string, input: any = {}) {
    return this.habits.focusAction(userId, sessionId, action, input);
  }
  async adjustFocus(
    userId: string,
    id: string,
    startedAt?: string,
    completedAt?: string,
    taskId?: string,
    expectedVersion?: number,
    idempotencyKey?: string,
  ) {
    return this.habits.adjustFocus(userId, id, startedAt, completedAt, taskId, expectedVersion, idempotencyKey);
  }
  async checkIn(userId: string, occurrenceId: string, input: any) {
    return this.habits.checkIn(userId, occurrenceId, input);
  }
  async habitOccurrenceAction(userId: string, id: string, action: 'skip' | 'fail' | 'undo', idempotencyKey?: string) {
    return this.habits.habitOccurrenceAction(userId, id, action, idempotencyKey);
  }
  async updateChecklistItem(userId: string, id: string, data: any) {
    return this.habits.updateChecklistItem(userId, id, data);
  }
  async setOccurrenceChecklistItem(userId: string, occurrenceId: string, itemId: string, completed: boolean) {
    return this.habits.setOccurrenceChecklistItem(userId, occurrenceId, itemId, completed);
  }
  async habitStats(userId: string, habitId: string) {
    return this.habits.habitStats(userId, habitId);
  }
  async listHabitStats(userId: string, habitIds: string[]) {
    return this.habits.listHabitStats(userId, habitIds);
  }
}
