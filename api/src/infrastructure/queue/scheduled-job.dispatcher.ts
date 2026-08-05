import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DELETION_CONSTANTS } from '@core/application/constants/app.constants';
import { TOKENS } from '@core/application/constants/tokens';
import type { IScheduledJobRepository } from '@core/application/ports/out/repositories.port';
import type { ILogger, IQueueJobHandler } from '@core/application/ports/out/services.port';

@Injectable()
export class ScheduledJobDispatcher implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(TOKENS.SCHEDULED_JOB_REPOSITORY) private readonly jobs: IScheduledJobRepository,
    @Inject(TOKENS.QUEUE_JOB_HANDLER) private readonly queue: IQueueJobHandler,
    @Inject(TOKENS.LOGGER) private readonly logger: ILogger,
  ) {}

  onModuleInit(): void {
    void this.dispatch();
    this.timer = setInterval(() => void this.dispatch(), DELETION_CONSTANTS.dispatcherIntervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async dispatch(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const staleBefore = new Date(now.getTime() - DELETION_CONSTANTS.publishingLockTimeoutMs);
      const publishedBefore = new Date(now.getTime() - DELETION_CONSTANTS.publishedAckTimeoutMs);
      const jobs = await this.jobs.claimPublishable(
        now,
        staleBefore,
        publishedBefore,
        DELETION_CONSTANTS.dispatcherBatchSize,
      );
      for (const job of jobs) {
        try {
          await this.queue.enqueueScheduledJob(job.id);
          await this.jobs.markPublished(job.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.jobs.markFailed(job.id, message);
          this.logger.error('Scheduled job publish failed', { jobId: job.id, error: message });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('Scheduled job dispatch skipped', { error: message });
    } finally {
      this.running = false;
    }
  }
}
