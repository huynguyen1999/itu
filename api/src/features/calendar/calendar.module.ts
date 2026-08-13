import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProductivityModule } from '../productivity/productivity.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { CalendarService } from '@core/application/use-cases/calendar.service';
import { CalendarSyncService } from '@core/application/use-cases/calendar-sync.service';
import { CalendarController } from '@infrastructure/transport/rest/controllers/calendar.controller';
import { CALENDAR_INTEGRATION_PORT, CALENDAR_REPOSITORY_PORT } from '@core/application/ports/out/calendar.port';
import { PrismaCalendarRepository } from '@infrastructure/persistence/prisma/prisma-calendar.repository';
import { CalendarIntegrationProvider } from '@infrastructure/calendar/calendar-integration.provider';
import { CalendarSyncScheduler } from '@infrastructure/calendar/calendar-sync.scheduler';

@Module({
  imports: [AuthModule, ProductivityModule, PersistenceModule],
  controllers: [CalendarController],
  providers: [
    CalendarService,
    CalendarSyncService,
    PrismaCalendarRepository,
    { provide: CALENDAR_REPOSITORY_PORT, useExisting: PrismaCalendarRepository },
    { provide: CALENDAR_INTEGRATION_PORT, useClass: CalendarIntegrationProvider },
    CalendarSyncScheduler,
  ],
})
export class CalendarModule {}
