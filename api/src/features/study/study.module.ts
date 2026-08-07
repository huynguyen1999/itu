import { Module } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import { StudyService } from '@core/application/use-cases/study.service';
import { SrsSchedulerService } from '@core/application/use-cases/srs-scheduler.service';
import { StudyController } from '@infrastructure/transport/rest/controllers/study.controller';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [StudyController],
  providers: [
    SrsSchedulerService,
    StudyService,
    { provide: TOKENS.STUDY_USE_CASE, useExisting: StudyService },
  ],
  exports: [StudyService, TOKENS.STUDY_USE_CASE],
})
export class StudyModule {}

