import { Module } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { MediaController } from '@infrastructure/transport/rest/controllers/media.controller';
import { LocalMediaStorage } from './local-media-storage';

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [MediaController],
  providers: [LocalMediaStorage, { provide: TOKENS.MEDIA_STORAGE, useExisting: LocalMediaStorage }],
  exports: [LocalMediaStorage, TOKENS.MEDIA_STORAGE],
})
export class MediaModule {}
