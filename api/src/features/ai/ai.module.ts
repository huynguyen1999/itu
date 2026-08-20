import { Module } from '@nestjs/common';
import { AiService } from '@core/application/use-cases/ai.service';
import { AiController } from '@infrastructure/transport/rest/controllers/ai.controller';
import { AiRateLimitGuard } from '@infrastructure/transport/rest/guards/ai-rate-limit.guard';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { QueueModule } from '@infrastructure/queue/queue.module';
import { AiProviderModule } from '@infrastructure/ai/ai-provider.module';
import { PermissionsGuard } from '@infrastructure/transport/rest/guards/permissions.guard';
import { MediaModule } from '@infrastructure/media/media.module';
import { AiCredentialsController } from '@infrastructure/transport/rest/controllers/ai-credentials.controller';
import { AiCredentialsService } from '@core/application/use-cases/ai-credentials.service';
import { TOKENS } from '@core/application/constants/tokens';
import { JOURNAL_REPOSITORY } from '@core/application/ports/out/journal-repository.port';

@Module({
  imports: [AuthModule, PersistenceModule, QueueModule, AiProviderModule, MediaModule],
  controllers: [AiController, AiCredentialsController],
  providers: [
    AiRateLimitGuard,
    PermissionsGuard,
    {
      provide: AiCredentialsService,
      useFactory: (credentials, crypto, validator) => new AiCredentialsService(credentials, crypto, validator),
      inject: [TOKENS.AI_CREDENTIAL_REPOSITORY, TOKENS.AI_CREDENTIAL_CRYPTO, TOKENS.GEMINI_KEY_VALIDATOR],
    },
    {
      provide: AiService,
      useFactory: (jobs, feedback, sessions, queue, logger, ai, media, credentials, journal) =>
        new AiService(jobs, feedback, sessions, queue, logger, ai, media, credentials, journal),
      inject: [
        TOKENS.AI_JOB_REPOSITORY,
        TOKENS.AI_FEEDBACK_REPOSITORY,
        TOKENS.STUDY_SESSION_REPOSITORY,
        TOKENS.QUEUE_JOB_HANDLER,
        TOKENS.LOGGER,
        TOKENS.AI_PROVIDER,
        TOKENS.MEDIA_STORAGE,
        AiCredentialsService,
        JOURNAL_REPOSITORY,
      ],
    },
  ],
  exports: [AiService],
})
export class AiModule {}
