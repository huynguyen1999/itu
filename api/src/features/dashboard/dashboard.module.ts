import { Module } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import { DashboardService } from '@core/application/use-cases/dashboard.service';
import { DashboardController } from '@infrastructure/transport/rest/controllers/dashboard.controller';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    { provide: TOKENS.DASHBOARD_USE_CASE, useExisting: DashboardService },
  ],
  exports: [DashboardService, TOKENS.DASHBOARD_USE_CASE],
})
export class DashboardModule {}

