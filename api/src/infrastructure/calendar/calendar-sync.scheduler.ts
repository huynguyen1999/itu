import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CalendarSyncService } from '@core/application/use-cases/calendar-sync.service';

@Injectable()
export class CalendarSyncScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly sync: CalendarSyncService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.sync.syncAllGoogle(), 20 * 60 * 1000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
