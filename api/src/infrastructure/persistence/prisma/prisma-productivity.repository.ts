import { Injectable } from '@nestjs/common';
import { IProductivityRepository } from '@core/application/ports/out/repositories.port';
import { PrismaService } from './prisma.service';
import { createUlid } from './ulid';
import { PrismaProductivityHabits } from './prisma-productivity-habits';
import { PrismaProductivityTaskRepository } from './prisma-productivity-task.repository';
import { Prisma, ReminderRelativeTo, ReminderStatus, ReminderType, ScheduledJobStatus, ScheduledJobType, TaskStatus } from '@prisma/client';
import { DomainException, EntityNotFoundException } from '@core/domain/exceptions';
import { calculateRelativeReminderAt, parseTaskDate, resolveReminderAnchor } from '@core/application/use-cases/task-date-rules';

@Injectable()
export class PrismaProductivityRepository extends PrismaProductivityTaskRepository implements IProductivityRepository {
  constructor(db: PrismaService, private readonly habits: PrismaProductivityHabits) {
    super(db);
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
  async listHabitCalendar(userId: string, filter: { from: string; to: string; habitId?: string }) {
    return this.habits.listHabitCalendar(userId, filter);
  }
  async checkInByDate(userId: string, habitId: string, localDate: string, data: any) {
    return this.habits.checkInByDate(userId, habitId, localDate, data);
  }
  async habitOccurrenceActionByDate(userId: string, habitId: string, localDate: string, action: 'skip' | 'fail' | 'undo', idempotencyKey?: string) {
    return this.habits.habitOccurrenceActionByDate(userId, habitId, localDate, action, idempotencyKey);
  }
  async listHabitProgress(userId: string, habitId: string, filter?: { from?: string; to?: string }) {
    return this.habits.listHabitProgress(userId, habitId, filter);
  }
  async habitInsights(userId: string, habitId: string, filter: { from: string; to: string }) {
    return this.habits.habitInsights(userId, habitId, filter);
  }
  async habitReminderAction(userId: string, deliveryId: string, action: 'snooze' | 'dismiss' | 'complete', remindAt?: string) {
    return this.habits.habitReminderAction(userId, deliveryId, action, remindAt);
  }
  async deleteHabitProgress(userId: string, progressId: string) {
    return this.habits.deleteHabitProgress(userId, progressId);
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
    const type = input.type === 'RELATIVE' || input.relativeTo || input.offsetMinutes !== undefined || input.calendarDayOffset !== undefined || input.timeOfDayMinutes !== undefined
      ? ReminderType.RELATIVE
      : ReminderType.ABSOLUTE;
    const relativeTo = type === ReminderType.RELATIVE
      ? (input.relativeTo ?? (task.dueAt ? ReminderRelativeTo.DUE_AT : ReminderRelativeTo.SCHEDULE_START_AT))
      : null;
    const remindAt = type === ReminderType.RELATIVE
      ? calculateRelativeReminderAt(task, {
          relativeTo,
          offsetMinutes: input.offsetMinutes,
          calendarDayOffset: input.calendarDayOffset,
          timeOfDayMinutes: input.timeOfDayMinutes,
          timeZone: input.timeZone,
        })
      : parseTaskDate(input.remindAt);
    if (!remindAt) throw new DomainException('Absolute reminders require a reminder time', 'REMINDER_TIME_REQUIRED', 400);
    const reminderId = createUlid();
    const jobId = createUlid();
    return this.db.$transaction(async (tx) => {
      await tx.scheduledJob.create({
        data: {
          id: jobId,
          userId,
          type: ScheduledJobType.TASK_REMINDER,
          payload: { reminderId },
          runAt: remindAt,
        },
      });
      return tx.taskReminder.create({
        data: {
          id: reminderId,
          userId,
          taskId,
          type,
          remindAt,
          relativeTo,
          offsetMinutes: input.offsetMinutes ?? null,
          calendarDayOffset: input.calendarDayOffset ?? null,
          timeOfDayMinutes: input.timeOfDayMinutes ?? null,
          timeZone: input.timeZone ?? null,
          persistent: input.persistent,
          scheduledJobId: jobId,
        },
      });
    });
  }

  async updateReminder(userId: string, id: string, input: { remindAt: string }) {
    const reminder = await this.db.taskReminder.findFirst({ where: { id, userId } });
    if (!reminder) throw new EntityNotFoundException('Reminder', id);
    const remindAt = parseTaskDate(input.remindAt);
    if (!remindAt) throw new DomainException('Reminder time is required', 'REMINDER_TIME_REQUIRED', 400);
    const jobId = createUlid();

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
      await tx.scheduledJob.create({
        data: {
          id: jobId,
          userId,
          type: ScheduledJobType.TASK_REMINDER,
          payload: { reminderId: id },
          runAt: remindAt,
        },
      });
      return tx.taskReminder.update({
        where: { id },
        data: {
          type: ReminderType.ABSOLUTE,
          remindAt,
          relativeTo: null,
          offsetMinutes: null,
          calendarDayOffset: null,
          timeOfDayMinutes: null,
          timeZone: null,
          status: ReminderStatus.SCHEDULED,
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
          type: ScheduledJobType.TASK_REMINDER,
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
