import { Module } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import { DashboardService } from '@core/application/use-cases/dashboard.service';
import {
  IDeckRepository,
  IReviewStateRepository,
  IStudySessionRepository,
} from '@core/application/ports/out/repositories.port';
import { DashboardController } from '@infrastructure/transport/rest/controllers/dashboard.controller';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [DashboardController],
  providers: [
    {
      provide: TOKENS.DASHBOARD_USE_CASE,
      useFactory: (decks: IDeckRepository, states: IReviewStateRepository, sessions: IStudySessionRepository) =>
        new DashboardService(decks, states, sessions),
      inject: [TOKENS.DECK_REPOSITORY, TOKENS.REVIEW_STATE_REPOSITORY, TOKENS.STUDY_SESSION_REPOSITORY],
    },
  ],
})
export class DashboardModule {}
