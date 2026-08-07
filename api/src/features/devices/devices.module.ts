import { Module } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import { DevicesService } from '@core/application/use-cases/devices.service';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { AuthModule } from '@features/auth/auth.module';
import { DevicesController } from '@infrastructure/transport/rest/controllers/devices.controller';

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [DevicesController],
  providers: [
    DevicesService,
    { provide: TOKENS.DEVICES_USE_CASE, useExisting: DevicesService },
  ],
  exports: [DevicesService, TOKENS.DEVICES_USE_CASE],
})
export class DevicesModule {}

