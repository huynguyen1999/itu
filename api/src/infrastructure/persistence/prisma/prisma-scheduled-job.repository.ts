import { Injectable } from '@nestjs/common';
import { ScheduledJobStatus, ScheduledJobType } from '@core/domain/enums';
import { IReminderRepository, IScheduledJobRepository } from '@core/application/ports/out/repositories.port';
import type { CreateScheduledJobData } from '@core/application/ports/out/repository-types.port';
import { HabitReminderDeliveryStatus, ReminderStatus, TaskStatus } from '@prisma/client';
import { addLocalDays, isHabitScheduled, localDateKey, localDateTimeToUtc, parseLocalDate, projectHabitDays } from '@core/application/use-cases/habit-v2';
import { PrismaService } from './prisma.service';
import { mapScheduledJob } from './prisma.mappers';
import { createUlid } from './ulid';

@Injectable()
export class PrismaScheduledJobRepository implements IScheduledJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateScheduledJobData) {
    const job = await this.prisma.scheduledJob.create({
      data: {
        id: createUlid(),
        userId: data.userId,
        type: data.type,
        payload: data.payload as object,
        runAt: data.runAt,
      },
    });
    return mapScheduledJob(job);
  }

  async findById(jobId: string) {
    const job = await this.prisma.scheduledJob.findUnique({ where: { id: jobId } });
    return job ? mapScheduledJob(job) : null;
  }

  async claimPublishable(now: Date, staleBefore: Date, publishedBefore: Date, limit: number) {
    return this.prisma.$transaction(async (tx) => {
      const jobs = await tx.scheduledJob.findMany({
        where: {
          OR: [
            { status: { in: [ScheduledJobStatus.SCHEDULED, ScheduledJobStatus.FAILED] }, runAt: { lte: now } },
            { status: ScheduledJobStatus.PUBLISHING, lockedAt: { lt: staleBefore } },
            { status: ScheduledJobStatus.PUBLISHED, publishedAt: { lt: publishedBefore } },
          ],
        },
        orderBy: { runAt: 'asc' },
        take: limit,
      });
      if (jobs.length === 0) return [];
      await tx.scheduledJob.updateMany({
        where: { id: { in: jobs.map((job) => job.id) } },
        data: { status: ScheduledJobStatus.PUBLISHING, lockedAt: now },
      });
      return jobs.map((job) => mapScheduledJob({ ...job, status: ScheduledJobStatus.PUBLISHING, lockedAt: now }));
    });
  }

  async markPublished(jobId: string) {
    await this.prisma.scheduledJob.update({
      where: { id: jobId },
      data: { status: ScheduledJobStatus.PUBLISHED, publishedAt: new Date(), lastError: null },
    });
  }

  async markRunning(jobId: string) {
    const job = await this.prisma.scheduledJob.findUnique({ where: { id: jobId } });
    if (!job || job.status === ScheduledJobStatus.COMPLETED || job.status === ScheduledJobStatus.CANCELED) return null;
    const updated = await this.prisma.scheduledJob.update({
      where: { id: jobId },
      data: { status: ScheduledJobStatus.RUNNING, attempts: { increment: 1 }, lockedAt: new Date() },
    });
    return mapScheduledJob(updated);
  }

  async markCompleted(jobId: string) {
    await this.prisma.scheduledJob.update({
      where: { id: jobId },
      data: { status: ScheduledJobStatus.COMPLETED, completedAt: new Date(), lastError: null },
    });
  }

  async markFailed(jobId: string, error: string) {
    await this.prisma.scheduledJob.update({
      where: { id: jobId },
      data: { status: ScheduledJobStatus.FAILED, lastError: error, lockedAt: null },
    });
  }

  async cancelUserJobs(userId: string, statuses: ScheduledJobStatus[]) {
    await this.prisma.scheduledJob.updateMany({
      where: { userId, status: { in: statuses } },
      data: { status: ScheduledJobStatus.CANCELED },
    });
  }
}

@Injectable()
export class PrismaReminderRepository implements IReminderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async deliver(reminderId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const reminder = await tx.taskReminder.findUnique({
        where: { id: reminderId },
        include: { task: true },
      });
      if (
        !reminder ||
        (reminder.status !== ReminderStatus.SCHEDULED && reminder.status !== ReminderStatus.SNOOZED) ||
        reminder.remindAt > new Date() ||
        reminder.task.status === TaskStatus.COMPLETED ||
        reminder.task.status === TaskStatus.CANCELED ||
        reminder.task.status === TaskStatus.ARCHIVED
      ) {
        return false;
      }
      const claimed = await tx.taskReminder.updateMany({
        where: {
          id: reminderId,
          status: { in: [ReminderStatus.SCHEDULED, ReminderStatus.SNOOZED] },
          deliveredAt: null,
        },
        data: {
          status: ReminderStatus.DELIVERED,
          deliveredAt: new Date(),
        },
      });
      if (!claimed.count) return false;
      await tx.notification.upsert({
        where: { reminderId: reminder.id },
        create: {
          id: createUlid(),
          userId: reminder.userId,
          reminderId: reminder.id,
          title: reminder.task.title,
          body: 'Task reminder',
          actionUrl: '/plan',
        },
        update: {
          title: reminder.task.title,
          body: 'Task reminder',
          actionUrl: '/plan',
          readAt: null,
          createdAt: new Date(),
        },
      });
      return true;
    });
  }

  async deliverHabitReminder(deliveryId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const delivery = await tx.habitReminderDelivery.findUnique({
        where: { id: deliveryId },
        include: {
          reminder: { include: { habit: true } },
          occurrence: { include: { progressLogs: true } },
        },
      });
      if (!delivery || (delivery.status !== HabitReminderDeliveryStatus.SCHEDULED && delivery.status !== HabitReminderDeliveryStatus.SNOOZED)) return false;
      if (!delivery.reminder.enabled || delivery.reminder.habit.archivedAt || delivery.scheduledFor > new Date()) return false;
      const localDate = localDateKey(delivery.localDate);
      const preferences = tx.userPreferences?.findUnique
        ? await tx.userPreferences.findUnique({ where: { userId: delivery.reminder.habit.userId }, select: { habitPreferences: true } })
        : null;
      const habitPreferences = preferences?.habitPreferences as { weekStartDay?: unknown; dayRolloverCutoffHour?: unknown } | null | undefined;
      const weekStartDay = String(habitPreferences?.weekStartDay).toUpperCase() === 'SUNDAY' ? 0 : 1;
      const cutoff = Number(habitPreferences?.dayRolloverCutoffHour ?? 4);
      const cutoffHour = Number.isInteger(cutoff) ? Math.min(23, Math.max(0, cutoff)) : 4;
      const occurrence = delivery.occurrence ?? (tx.habitOccurrence?.findUnique
        ? await tx.habitOccurrence.findUnique({
            where: {
              habitId_occurrenceDate: {
                habitId: delivery.reminder.habitId,
                occurrenceDate: parseLocalDate(localDate),
              },
            },
            include: { progressLogs: true },
          })
        : null);
      const state = projectHabitDays(
        delivery.reminder.habit,
        localDate,
        localDate,
        occurrence ? [occurrence] : [],
        new Date(),
        weekStartDay,
        cutoffHour,
      )[0];
      if (!state || ['COMPLETED', 'SKIPPED', 'FAILED', 'MISSED'].includes(state.status)) {
        await tx.habitReminderDelivery.update({ where: { id: delivery.id }, data: { status: HabitReminderDeliveryStatus.CANCELED } });
        await this.scheduleNextHabitReminder(tx, delivery, new Date());
        return false;
      }
      const claimed = await tx.habitReminderDelivery.updateMany({
        where: { id: delivery.id, status: { in: [HabitReminderDeliveryStatus.SCHEDULED, HabitReminderDeliveryStatus.SNOOZED] }, deliveredAt: null },
        data: { status: HabitReminderDeliveryStatus.DELIVERED, deliveredAt: new Date() },
      });
      if (claimed.count) {
        await tx.notification.upsert({
          where: { habitReminderDeliveryId: delivery.id },
          create: {
            id: createUlid(),
            userId: delivery.reminder.habit.userId,
            habitReminderDeliveryId: delivery.id,
            title: delivery.reminder.habit.name,
            body: "You haven't completed this habit yet.",
            actionUrl: '/habits',
          },
          update: {
            title: delivery.reminder.habit.name,
            body: "You haven't completed this habit yet.",
            actionUrl: '/habits',
            readAt: null,
            createdAt: new Date(),
          },
        });
        await this.scheduleNextHabitReminder(tx, delivery, new Date());
      }
      return claimed.count > 0;
    });
  }

  private async scheduleNextHabitReminder(tx: any, delivery: any, now: Date): Promise<void> {
    const habit = delivery.reminder.habit;
    if (!delivery.reminder.enabled || habit.archivedAt) return;
    const preferences = tx.userPreferences?.findUnique
      ? await tx.userPreferences.findUnique({ where: { userId: habit.userId }, select: { habitPreferences: true } })
      : null;
    const weekStartDay = String(preferences?.habitPreferences?.weekStartDay).toUpperCase() === 'SUNDAY' ? 0 : 1;
    const timezone = habit.timezone ?? 'UTC';
    const currentDate = localDateKey(delivery.localDate);
    for (let offset = 1; offset <= 366; offset += 1) {
      const localDate = addLocalDays(currentDate, offset);
      if (!isHabitScheduled(habit, localDate, weekStartDay)) continue;
      const scheduledFor = localDateTimeToUtc(localDate, delivery.reminder.timeLocal, timezone);
      if (scheduledFor <= now) continue;
      const localDateValue = new Date(`${localDate}T00:00:00.000Z`);
      const existing = await tx.habitReminderDelivery.findUnique({
        where: { reminderId_localDate: { reminderId: delivery.reminder.id, localDate: localDateValue } },
      });
      if (existing && existing.status !== HabitReminderDeliveryStatus.CANCELED) return;
      const nextDeliveryId = existing?.id ?? createUlid();
      const jobId = createUlid();
      await tx.scheduledJob.create({
        data: {
          id: jobId,
          userId: habit.userId,
          type: ScheduledJobType.HABIT_REMINDER,
          payload: { deliveryId: nextDeliveryId },
          runAt: scheduledFor,
        },
      });
      if (existing) {
        await tx.habitReminderDelivery.update({
          where: { id: existing.id },
          data: { status: HabitReminderDeliveryStatus.SCHEDULED, scheduledFor, scheduledJobId: jobId, snoozedFrom: null, deliveredAt: null },
        });
      } else {
        await tx.habitReminderDelivery.create({
          data: {
            id: nextDeliveryId,
            reminderId: delivery.reminder.id,
            localDate: localDateValue,
            scheduledFor,
            status: HabitReminderDeliveryStatus.SCHEDULED,
            scheduledJobId: jobId,
          },
        });
      }
      return;
    }
  }
}
