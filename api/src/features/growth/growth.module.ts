import { Module } from '@nestjs/common';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { GrowthService } from '@core/application/use-cases/growth.service';
import { GrowthController } from '@infrastructure/transport/rest/controllers/growth.controller';
import { SyncModule } from '@features/sync/sync.module';
import { MediaModule } from '@infrastructure/media/media.module';

@Module({
  imports: [AuthModule, PersistenceModule, SyncModule, MediaModule],
  controllers: [GrowthController],
  providers: [GrowthService],
})
export class GrowthModule {}
