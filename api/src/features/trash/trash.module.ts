import { Module } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import { ITrashRepository } from '@core/application/ports/out/repositories.port';
import { IMediaStorage } from '@core/application/ports/out/services.port';
import { TrashService } from '@core/application/use-cases/trash.service';
import { AuthModule } from '@features/auth/auth.module';
import { MediaModule } from '@infrastructure/media/media.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { TrashController } from '@infrastructure/transport/rest/controllers/trash.controller';

@Module({
  imports: [AuthModule, PersistenceModule, MediaModule],
  controllers: [TrashController],
  providers: [
    {
      provide: TOKENS.TRASH_USE_CASE,
      useFactory: (trash: ITrashRepository, media: IMediaStorage) => new TrashService(trash, media),
      inject: [TOKENS.TRASH_REPOSITORY, TOKENS.MEDIA_STORAGE],
    },
  ],
})
export class TrashModule {}
