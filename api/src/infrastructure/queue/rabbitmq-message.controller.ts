import { Controller, Inject } from '@nestjs/common';
import { Ctx, MessagePattern, Payload, RmqContext } from '@nestjs/microservices';
import { TOKENS } from '@core/application/constants/tokens';
import type { ILogger, SyncQueueJob } from '@core/application/ports/out/services.port';
import { AiQueueJobProcessor } from './ai-queue-job.processor';
import { ScheduledJobProcessor } from './scheduled-job.processor';
import { SyncJobProcessor } from './sync-job.processor';
import type { AiQueueJob, ScheduledQueueJob } from './queue.types';

@Controller()
export class RabbitMqMessageController {
  constructor(
    private readonly aiProcessor: AiQueueJobProcessor,
    private readonly scheduledProcessor: ScheduledJobProcessor,
    private readonly syncProcessor: SyncJobProcessor,
    @Inject(TOKENS.LOGGER) private readonly logger: ILogger,
  ) {}

  @MessagePattern('card-suggestions')
  @MessagePattern('session-feedback')
  async handleAiJob(@Payload() job: AiQueueJob, @Ctx() context: RmqContext): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      await this.aiProcessor.process(job);
      channel.ack(originalMsg);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('AI job processing failed via @MessagePattern', {
        jobId: job.jobId,
        type: job.type,
        error: message,
      });
      channel.nack(originalMsg, false, true);
    }
  }

  @MessagePattern('scheduled-job')
  async handleScheduledJob(@Payload() job: ScheduledQueueJob, @Ctx() context: RmqContext): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      await this.scheduledProcessor.process(job);
      channel.ack(originalMsg);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Scheduled job processing failed via @MessagePattern', {
        jobId: job.jobId,
        error: message,
      });
      channel.nack(originalMsg, false, true);
    }
  }

  @MessagePattern('sync-invalidation')
  async handleSyncJob(@Payload() job: SyncQueueJob, @Ctx() context: RmqContext): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      await this.syncProcessor.process(job);
      channel.ack(originalMsg);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Sync job processing failed via @MessagePattern', {
        jobId: job.jobId,
        error: message,
      });
      channel.nack(originalMsg, false, true);
    }
  }
}
