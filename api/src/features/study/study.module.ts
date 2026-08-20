import { Module } from '@nestjs/common';
import { StudyService } from '@core/application/use-cases/study.service';
import { SrsSchedulerService } from '@core/application/use-cases/srs-scheduler.service';
import { StudyController } from '@infrastructure/transport/rest/controllers/study.controller';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { TOKENS } from '@core/application/constants/tokens';

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [StudyController],
  providers: [
    SrsSchedulerService,
    {
      provide: StudyService,
      useFactory: (reviewStates, sessions, cards, scheduler, feedback) =>
        new StudyService(reviewStates, sessions, cards, scheduler, feedback),
      inject: [
        TOKENS.REVIEW_STATE_REPOSITORY,
        TOKENS.STUDY_SESSION_REPOSITORY,
        TOKENS.CARD_REPOSITORY,
        SrsSchedulerService,
        { token: TOKENS.AI_FEEDBACK_REPOSITORY, optional: true },
      ],
    },
  ],
  exports: [StudyService],
})
export class StudyModule {}
