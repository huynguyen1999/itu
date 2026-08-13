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
import { AiProviderModule } from '@infrastructure/ai/ai-provider.module';

@Module({
  imports: [AuthModule, PersistenceModule, MediaModule, AiProviderModule],
  controllers: [JournalController, PreferencesController],
  providers: [JournalService, PreferencesService, ReviewContextBuilder, ReviewInsightsService],
  exports: [JournalService, PreferencesService, ReviewContextBuilder],
})
export class JournalModule {}
