import { Module } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import { DevicesService } from '@core/application/use-cases/devices.service';
import { ISyncDeviceRepository } from '@core/application/ports/out/repositories.port';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { AuthModule } from '@features/auth/auth.module';
import { DevicesController } from '@infrastructure/transport/rest/controllers/devices.controller';

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [DevicesController],
  providers: [
    {
      provide: TOKENS.DEVICES_USE_CASE,
      useFactory: (devices: ISyncDeviceRepository) => new DevicesService(devices),
      inject: [TOKENS.SYNC_DEVICE_REPOSITORY],
    },
  ],
})
export class DevicesModule {}
