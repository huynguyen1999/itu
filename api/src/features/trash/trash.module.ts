import { Module } from '@nestjs/common';
import { TrashService } from '@core/application/use-cases/trash.service';
import { AuthModule } from '@features/auth/auth.module';
import { MediaModule } from '@infrastructure/media/media.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { TrashController } from '@infrastructure/transport/rest/controllers/trash.controller';

@Module({
  imports: [AuthModule, PersistenceModule, MediaModule],
  controllers: [TrashController],
  providers: [TrashService],
  exports: [TrashService],
})
export class TrashModule {}
