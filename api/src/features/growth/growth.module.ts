import { Module } from '@nestjs/common';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { GrowthService } from '@core/application/use-cases/growth.service';
import { GrowthController } from '@infrastructure/transport/rest/controllers/growth.controller';
import { TOKENS } from '@core/application/constants/tokens';
import { IGrowthRepository, ISyncDeviceRepository } from '@core/application/ports/out/repositories.port';
import { ISyncInvalidationNotifier } from '@core/application/ports/out/services.port';
import { SyncModule } from '@features/sync/sync.module';
import { MediaModule } from '@infrastructure/media/media.module';

@Module({
  imports: [AuthModule, PersistenceModule, SyncModule, MediaModule],
  controllers: [GrowthController],
  providers: [
    {
      provide: GrowthService,
      useFactory: (
        repo: IGrowthRepository,
        invalidationNotifier: ISyncInvalidationNotifier,
        devices: ISyncDeviceRepository,
      ) => new GrowthService(repo, invalidationNotifier, devices),
      inject: [TOKENS.GROWTH_REPOSITORY, TOKENS.SYNC_INVALIDATION_NOTIFIER, TOKENS.SYNC_DEVICE_REPOSITORY],
    },
  ],
})
export class GrowthModule {}
