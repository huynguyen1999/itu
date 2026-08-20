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
import { REVIEW_DATA_SOURCE, type IReviewDataSource } from '@core/application/ports/out/review-data-source.port';
import { PreferencesService } from '@core/application/use-cases/preferences.service';
import { ReviewAutomationService } from '@core/application/use-cases/journal/review-automation.service';
import { JOURNAL_AUTOMATION_USER_QUERY, JOURNAL_REPOSITORY } from '@core/application/ports/out/journal-repository.port';
import { PREFERENCES_REPOSITORY } from '@core/application/ports/out/preferences-repository.port';
import { ReviewAutomationScheduler } from './review-automation.scheduler';

@Module({
  imports: [PersistenceModule, AiProviderModule, JwtModule],
  controllers: [RabbitMqMessageController],
  providers: [
    AiQueueJobProcessor,
    {
      provide: ReviewContextBuilder,
      useFactory: (source: IReviewDataSource) => new ReviewContextBuilder(source),
      inject: [REVIEW_DATA_SOURCE],
    },
    ScheduledJobProcessor,
    ScheduledJobDispatcher,
    ReviewAutomationScheduler,
    {
      provide: PreferencesService,
      useFactory: (preferences) => new PreferencesService(preferences),
      inject: [PREFERENCES_REPOSITORY],
    },
    {
      provide: ReviewAutomationService,
      useFactory: (journal, automationUsers, contextBuilder, preferences) =>
        new ReviewAutomationService(journal, automationUsers, contextBuilder, preferences),
      inject: [JOURNAL_REPOSITORY, JOURNAL_AUTOMATION_USER_QUERY, ReviewContextBuilder, PreferencesService],
    },
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
