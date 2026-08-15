import { Inject, Injectable } from '@nestjs/common';
import { DELETION_CONSTANTS } from '@core/application/constants/app.constants';
import { TOKENS } from '@core/application/constants/tokens';
import { ScheduledJobType } from '@core/domain/enums';
import type {
  IScheduledJobRepository,
  IReminderRepository,
  ITrashRepository,
  IUserRepository,
} from '@core/application/ports/out/repositories.port';
import type { ILogger, IMediaStorage } from '@core/application/ports/out/services.port';
import type { ScheduledQueueJob } from './queue.types';

@Injectable()
export class ScheduledJobProcessor {
  constructor(
    @Inject(TOKENS.SCHEDULED_JOB_REPOSITORY) private readonly jobs: IScheduledJobRepository,
    @Inject(TOKENS.USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(TOKENS.TRASH_REPOSITORY) private readonly trash: ITrashRepository,
    @Inject(TOKENS.REMINDER_REPOSITORY) private readonly reminders: IReminderRepository,
    @Inject(TOKENS.MEDIA_STORAGE) private readonly media: IMediaStorage,
    @Inject(TOKENS.LOGGER) private readonly logger: ILogger,
  ) {}

  async process(message: ScheduledQueueJob): Promise<void> {
    const job = await this.jobs.markRunning(message.jobId);
    if (!job) return;
    if (job.runAt > new Date()) {
      await this.jobs.markFailed(job.id, 'Scheduled job was delivered before runAt');
      return;
    }

    try {
      if (job.type === ScheduledJobType.ACCOUNT_DELETE) await this.deleteAccount(job.payload);
      if (job.type === ScheduledJobType.TRASH_PURGE) await this.purgeTrash();
      if (job.type === ScheduledJobType.TASK_REMINDER) await this.deliverReminder(job.payload);
      if (job.type === ScheduledJobType.HABIT_REMINDER) await this.deliverHabitReminder(job.payload);
      await this.jobs.markCompleted(job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.jobs.markFailed(job.id, message);
    }
  }

  private async deleteAccount(payload: unknown): Promise<void> {
    const userId = this.userIdFromPayload(payload);
    await this.users.hardDelete(userId);
    this.logger.debug('Scheduled account deletion completed', { userId });
  }

  private async purgeTrash(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DELETION_CONSTANTS.trashRetentionDays);
    const images = await this.trash.purgeExpired(cutoff);
    await Promise.all(images.map((image) => this.media.delete(image.storageKey)));
    this.logger.debug('Scheduled trash purge completed', { imageCount: images.length });
  }

  private async deliverReminder(payload: unknown): Promise<void> {
    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof (payload as { reminderId?: unknown }).reminderId !== 'string'
    ) {
      throw new Error('Scheduled reminder payload is missing reminderId');
    }
    await this.reminders.deliver((payload as { reminderId: string }).reminderId);
  }

  private async deliverHabitReminder(payload: unknown): Promise<void> {
    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof (payload as { deliveryId?: unknown }).deliveryId !== 'string'
    ) {
      throw new Error('Scheduled habit reminder payload is missing deliveryId');
    }
    if (!this.reminders.deliverHabitReminder) throw new Error('Habit reminder delivery is not configured');
    await this.reminders.deliverHabitReminder((payload as { deliveryId: string }).deliveryId);
  }

  private userIdFromPayload(payload: unknown): string {
    if (payload && typeof payload === 'object' && typeof (payload as { userId?: unknown }).userId === 'string') {
      return (payload as { userId: string }).userId;
    }
    throw new Error('Scheduled account deletion payload is missing userId');
  }
}
