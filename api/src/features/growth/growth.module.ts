import { Module } from '@nestjs/common';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { GrowthService } from '@core/application/use-cases/growth.service';
import { GrowthController } from '@infrastructure/transport/rest/controllers/growth.controller';
import { SyncModule } from '@features/sync/sync.module';
import { MediaModule } from '@infrastructure/media/media.module';
import { TOKENS } from '@core/application/constants/tokens';

@Module({
  imports: [AuthModule, PersistenceModule, SyncModule, MediaModule],
  controllers: [GrowthController],
  providers: [
    {
      provide: GrowthService,
      useFactory: (repo, invalidationNotifier, devices) => new GrowthService(repo, invalidationNotifier, devices),
      inject: [
        TOKENS.GROWTH_REPOSITORY,
        { token: TOKENS.SYNC_INVALIDATION_NOTIFIER, optional: true },
        { token: TOKENS.SYNC_DEVICE_REPOSITORY, optional: true },
      ],
    },
  ],
})
export class GrowthModule {}
