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
import { GymModule } from '../gym/gym.module';
import { TaskService } from '@core/application/use-cases/task.service';
import { FocusService } from '@core/application/use-cases/focus.service';
import { GymService } from '@core/application/use-cases/gym.service';

@Module({
  imports: [AuthModule, ProductivityModule, PersistenceModule, GymModule],
  controllers: [CalendarController],
  providers: [
    {
      provide: CalendarService,
      useFactory: (tasks, focus, repository, gymService) => new CalendarService(tasks, focus, repository, gymService),
      inject: [TaskService, FocusService, CALENDAR_REPOSITORY_PORT, { token: GymService, optional: true }],
    },
    {
      provide: CalendarSyncService,
      useFactory: (repository, integration) => new CalendarSyncService(repository, integration),
      inject: [CALENDAR_REPOSITORY_PORT, CALENDAR_INTEGRATION_PORT],
    },
    PrismaCalendarRepository,
    { provide: CALENDAR_REPOSITORY_PORT, useExisting: PrismaCalendarRepository },
    { provide: CALENDAR_INTEGRATION_PORT, useClass: CalendarIntegrationProvider },
    CalendarSyncScheduler,
  ],
})
export class CalendarModule {}
