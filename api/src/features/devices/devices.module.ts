import { Module } from '@nestjs/common';
import { DevicesService } from '@core/application/use-cases/devices.service';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { AuthModule } from '@features/auth/auth.module';
import { DevicesController } from '@infrastructure/transport/rest/controllers/devices.controller';
import { TOKENS } from '@core/application/constants/tokens';

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [DevicesController],
  providers: [
    {
      provide: DevicesService,
      useFactory: (devices) => new DevicesService(devices),
      inject: [TOKENS.SYNC_DEVICE_REPOSITORY],
    },
  ],
  exports: [DevicesService],
})
export class DevicesModule {}
