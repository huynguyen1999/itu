import { Module } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import { AiService } from '@core/application/use-cases/ai.service';
import {
  IAiFeedbackRepository,
  IAiJobRepository,
  IStudySessionRepository,
} from '@core/application/ports/out/repositories.port';
import { IAiProvider, ILogger, IMediaStorage, IQueueJobHandler } from '@core/application/ports/out/services.port';
import { AiController } from '@infrastructure/transport/rest/controllers/ai.controller';
import { AiRateLimitGuard } from '@infrastructure/transport/rest/guards/ai-rate-limit.guard';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { QueueModule } from '@infrastructure/queue/queue.module';
import { AiProviderModule } from '@infrastructure/ai/ai-provider.module';
import { PermissionsGuard } from '@infrastructure/transport/rest/guards/permissions.guard';
import { MediaModule } from '@infrastructure/media/media.module';

@Module({
  imports: [AuthModule, PersistenceModule, QueueModule, AiProviderModule, MediaModule],
  controllers: [AiController],
  providers: [
    AiRateLimitGuard,
    PermissionsGuard,
    {
      provide: TOKENS.AI_USE_CASE,
      useFactory: (
        jobs: IAiJobRepository,
        feedback: IAiFeedbackRepository,
        sessions: IStudySessionRepository,
        queue: IQueueJobHandler,
        logger: ILogger,
        ai: IAiProvider,
        media: IMediaStorage,
      ) => new AiService(jobs, feedback, sessions, queue, logger, ai, media),
      inject: [
        TOKENS.AI_JOB_REPOSITORY,
        TOKENS.AI_FEEDBACK_REPOSITORY,
        TOKENS.STUDY_SESSION_REPOSITORY,
        TOKENS.QUEUE_JOB_HANDLER,
        TOKENS.LOGGER,
        TOKENS.AI_PROVIDER,
        TOKENS.MEDIA_STORAGE,
      ],
    },
  ],
})
export class AiModule {}
