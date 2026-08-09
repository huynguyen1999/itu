import { Module } from '@nestjs/common';
import { DashboardService } from '@core/application/use-cases/dashboard.service';
import { DashboardController } from '@infrastructure/transport/rest/controllers/dashboard.controller';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
