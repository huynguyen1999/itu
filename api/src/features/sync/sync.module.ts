import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { TOKENS } from '@core/application/constants/tokens';
import { SyncService } from '@core/application/use-cases/sync.service';
import { ISyncRepository } from '@core/application/ports/out/sync-repository.port';
import { ISyncDeviceRepository } from '@core/application/ports/out/repositories.port';
import { IQueueJobHandler, ISyncInvalidationNotifier } from '@core/application/ports/out/services.port';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { AuthModule } from '@features/auth/auth.module';
import { SyncController } from '@infrastructure/transport/rest/controllers/sync.controller';
import { QueueModule } from '@infrastructure/queue/queue.module';

@Module({
  imports: [AuthModule, PersistenceModule, QueueModule, JwtModule, ConfigModule],
  controllers: [SyncController],
  providers: [
    {
      provide: TOKENS.SYNC_USE_CASE,
      useFactory: (
        syncRepository: ISyncRepository,
        queue: IQueueJobHandler,
        devices: ISyncDeviceRepository,
        invalidationNotifier: ISyncInvalidationNotifier,
      ) => new SyncService(syncRepository, queue, devices, invalidationNotifier),
      inject: [
        TOKENS.SYNC_REPOSITORY,
        TOKENS.QUEUE_JOB_HANDLER,
        TOKENS.SYNC_DEVICE_REPOSITORY,
        TOKENS.SYNC_INVALIDATION_NOTIFIER,
      ],
    },
  ],
  exports: [TOKENS.SYNC_USE_CASE, QueueModule],
})
export class SyncModule {}
