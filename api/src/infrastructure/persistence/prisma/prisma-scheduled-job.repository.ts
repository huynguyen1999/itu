import { Injectable } from '@nestjs/common';
import { ScheduledJobStatus } from '@core/domain/enums';
import { IReminderRepository, IScheduledJobRepository } from '@core/application/ports/out/repositories.port';
import type { CreateScheduledJobData } from '@core/application/ports/out/repository-types.port';
import { ReminderStatus, TaskStatus } from '@prisma/client';
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
}
