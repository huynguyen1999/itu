import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { TOKENS } from '@core/application/constants/tokens';
import { SyncService } from '@core/application/use-cases/sync.service';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { AuthModule } from '@features/auth/auth.module';
import { SyncController } from '@infrastructure/transport/rest/controllers/sync.controller';
import { QueueModule } from '@infrastructure/queue/queue.module';

@Module({
  imports: [AuthModule, PersistenceModule, QueueModule, JwtModule, ConfigModule],
  controllers: [SyncController],
  providers: [
    SyncService,
    { provide: TOKENS.SYNC_USE_CASE, useExisting: SyncService },
  ],
  exports: [SyncService, TOKENS.SYNC_USE_CASE, QueueModule],
})
export class SyncModule {}

