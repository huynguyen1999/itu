import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProductivityModule } from '../productivity/productivity.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { CalendarService } from '@core/application/use-cases/calendar.service';
import { CalendarSyncService } from '@core/application/use-cases/calendar-sync.service';
import { CalendarController } from '@infrastructure/transport/rest/controllers/calendar.controller';

@Module({
  imports: [AuthModule, ProductivityModule, PersistenceModule],
  controllers: [CalendarController],
  providers: [CalendarService, CalendarSyncService],
})
export class CalendarModule {}
