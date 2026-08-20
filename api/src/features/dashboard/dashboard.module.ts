import { Module } from '@nestjs/common';
import { DashboardService } from '@core/application/use-cases/dashboard.service';
import { DashboardController } from '@infrastructure/transport/rest/controllers/dashboard.controller';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { TOKENS } from '@core/application/constants/tokens';

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [DashboardController],
  providers: [
    {
      provide: DashboardService,
      useFactory: (decks, reviewStates, sessions) => new DashboardService(decks, reviewStates, sessions),
      inject: [TOKENS.DECK_REPOSITORY, TOKENS.REVIEW_STATE_REPOSITORY, TOKENS.STUDY_SESSION_REPOSITORY],
    },
  ],
  exports: [DashboardService],
})
export class DashboardModule {}
