import { Module } from '@nestjs/common';
import { JournalService } from '@core/application/use-cases/journal/journal.service';
import { JournalController } from '@infrastructure/transport/rest/controllers/journal.controller';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { MediaModule } from '@infrastructure/media/media.module';

@Module({
  imports: [AuthModule, PersistenceModule, MediaModule],
  controllers: [JournalController],
  providers: [JournalService],
  exports: [JournalService],
})
export class JournalModule {}
