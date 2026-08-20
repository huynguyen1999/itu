import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { SyncService } from '@core/application/use-cases/sync.service';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { AuthModule } from '@features/auth/auth.module';
import { SyncController } from '@infrastructure/transport/rest/controllers/sync.controller';
import { QueueModule } from '@infrastructure/queue/queue.module';
import { TOKENS } from '@core/application/constants/tokens';

@Module({
  imports: [AuthModule, PersistenceModule, QueueModule, JwtModule, ConfigModule],
  controllers: [SyncController],
  providers: [
    {
      provide: SyncService,
      useFactory: (syncRepository, queue, devices, invalidationNotifier) =>
        new SyncService(syncRepository, queue, devices, invalidationNotifier),
      inject: [
        TOKENS.SYNC_REPOSITORY,
        TOKENS.QUEUE_JOB_HANDLER,
        TOKENS.SYNC_DEVICE_REPOSITORY,
        TOKENS.SYNC_INVALIDATION_NOTIFIER,
      ],
    },
  ],
  exports: [SyncService, QueueModule],
})
export class SyncModule {}
