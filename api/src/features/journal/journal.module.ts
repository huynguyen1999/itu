import { Module } from '@nestjs/common';
import { JournalService } from '@core/application/use-cases/journal/journal.service';
import { PreferencesService } from '@core/application/use-cases/preferences.service';
import { JournalController } from '@infrastructure/transport/rest/controllers/journal.controller';
import { PreferencesController } from '@infrastructure/transport/rest/controllers/preferences.controller';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { MediaModule } from '@infrastructure/media/media.module';
import { ReviewContextBuilder } from '@core/application/use-cases/review-context.builder';
import { ReviewInsightsService } from '@core/application/use-cases/review-insights.service';
import { ReviewAutomationService } from '@core/application/use-cases/journal/review-automation.service';
import { AiProviderModule } from '@infrastructure/ai/ai-provider.module';
import { TOKENS } from '@core/application/constants/tokens';
import {
  JOURNAL_ATTACHMENT_REPOSITORY,
  JOURNAL_AUTOMATION_USER_QUERY,
  JOURNAL_REPOSITORY,
  JOURNAL_TAG_REPOSITORY,
  JOURNAL_TEMPLATE_REPOSITORY,
  JOURNAL_WEEKLY_REVIEW_QUERY,
} from '@core/application/ports/out/journal-repository.port';
import { REVIEW_DATA_SOURCE } from '@core/application/ports/out/review-data-source.port';
import { PREFERENCES_REPOSITORY } from '@core/application/ports/out/preferences-repository.port';

@Module({
  imports: [AuthModule, PersistenceModule, MediaModule, AiProviderModule],
  controllers: [JournalController, PreferencesController],
  providers: [
    {
      provide: JournalService,
      useFactory: (journal, templates, tags, attachments, weeklyReview, contextBuilder, reviewAutomation) =>
        new JournalService(journal, templates, tags, attachments, weeklyReview, contextBuilder, reviewAutomation),
      inject: [
        JOURNAL_REPOSITORY,
        JOURNAL_TEMPLATE_REPOSITORY,
        JOURNAL_TAG_REPOSITORY,
        JOURNAL_ATTACHMENT_REPOSITORY,
        JOURNAL_WEEKLY_REVIEW_QUERY,
        ReviewContextBuilder,
        ReviewAutomationService,
      ],
    },
    {
      provide: PreferencesService,
      useFactory: (preferences) => new PreferencesService(preferences),
      inject: [PREFERENCES_REPOSITORY],
    },
    {
      provide: ReviewContextBuilder,
      useFactory: (source) => new ReviewContextBuilder(source),
      inject: [REVIEW_DATA_SOURCE],
    },
    {
      provide: ReviewInsightsService,
      useFactory: (journal, ai, contextBuilder) => new ReviewInsightsService(journal, ai, contextBuilder),
      inject: [JOURNAL_REPOSITORY, TOKENS.AI_PROVIDER, ReviewContextBuilder],
    },
    {
      provide: ReviewAutomationService,
      useFactory: (journal, automationUsers, contextBuilder, preferences) =>
        new ReviewAutomationService(journal, automationUsers, contextBuilder, preferences),
      inject: [JOURNAL_REPOSITORY, JOURNAL_AUTOMATION_USER_QUERY, ReviewContextBuilder, PreferencesService],
    },
  ],
  exports: [JournalService, PreferencesService, ReviewContextBuilder],
})
export class JournalModule {}
