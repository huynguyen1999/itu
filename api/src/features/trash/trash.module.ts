import { Module } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import { TrashService } from '@core/application/use-cases/trash.service';
import { AuthModule } from '@features/auth/auth.module';
import { MediaModule } from '@infrastructure/media/media.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { TrashController } from '@infrastructure/transport/rest/controllers/trash.controller';

@Module({
  imports: [AuthModule, PersistenceModule, MediaModule],
  controllers: [TrashController],
  providers: [
    TrashService,
    { provide: TOKENS.TRASH_USE_CASE, useExisting: TrashService },
  ],
  exports: [TrashService, TOKENS.TRASH_USE_CASE],
})
export class TrashModule {}

