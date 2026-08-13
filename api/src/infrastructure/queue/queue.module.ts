import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TOKENS } from '@core/application/constants/tokens';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { AiProviderModule } from '@infrastructure/ai/ai-provider.module';
import { WebSocketSyncInvalidationNotifier } from '@infrastructure/sync/websocket-sync-invalidation.notifier';
import { AiQueueJobProcessor } from './ai-queue-job.processor';
import { RabbitMqMessageController } from './rabbitmq-message.controller';
import { RabbitMqQueueJobHandler } from './rabbitmq-queue-job.handler';
import { ScheduledJobDispatcher } from './scheduled-job.dispatcher';
import { ScheduledJobProcessor } from './scheduled-job.processor';
import { SyncJobProcessor } from './sync-job.processor';
import { LocalMediaStorage } from '@infrastructure/media/local-media-storage';
import { ReviewContextBuilder } from '@core/application/use-cases/review-context.builder';

@Module({
  imports: [PersistenceModule, AiProviderModule, JwtModule],
  controllers: [RabbitMqMessageController],
  providers: [
    AiQueueJobProcessor,
    ReviewContextBuilder,
    ScheduledJobProcessor,
    ScheduledJobDispatcher,
    SyncJobProcessor,
    LocalMediaStorage,
    RabbitMqQueueJobHandler,
    { provide: TOKENS.MEDIA_STORAGE, useExisting: LocalMediaStorage },
    { provide: TOKENS.QUEUE_JOB_HANDLER, useExisting: RabbitMqQueueJobHandler },
    { provide: TOKENS.SYNC_INVALIDATION_NOTIFIER, useClass: WebSocketSyncInvalidationNotifier },
  ],
  exports: [TOKENS.QUEUE_JOB_HANDLER, TOKENS.SYNC_INVALIDATION_NOTIFIER],
})
export class QueueModule {}
