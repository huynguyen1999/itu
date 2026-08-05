import { Module } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import { StudyService } from '@core/application/use-cases/study.service';
import { SrsSchedulerService } from '@core/application/use-cases/srs-scheduler.service';
import {
  ICardRepository,
  IAiFeedbackRepository,
  IReviewStateRepository,
  IStudySessionRepository,
} from '@core/application/ports/out/repositories.port';
import { StudyController } from '@infrastructure/transport/rest/controllers/study.controller';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [StudyController],
  providers: [
    SrsSchedulerService,
    {
      provide: TOKENS.STUDY_USE_CASE,
      useFactory: (
        states: IReviewStateRepository,
        sessions: IStudySessionRepository,
        cards: ICardRepository,
        scheduler: SrsSchedulerService,
        feedback: IAiFeedbackRepository,
      ) => new StudyService(states, sessions, cards, scheduler, feedback),
      inject: [
        TOKENS.REVIEW_STATE_REPOSITORY,
        TOKENS.STUDY_SESSION_REPOSITORY,
        TOKENS.CARD_REPOSITORY,
        SrsSchedulerService,
        TOKENS.AI_FEEDBACK_REPOSITORY,
      ],
    },
  ],
  exports: [TOKENS.STUDY_USE_CASE],
})
export class StudyModule {}
