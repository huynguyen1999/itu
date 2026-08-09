import { Module } from '@nestjs/common';
import { AuthModule } from '@features/auth/auth.module';
import { SyncModule } from '@features/sync/sync.module';
import { QueueModule } from '@infrastructure/queue/queue.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { TaskService } from '@core/application/use-cases/task.service';
import { HabitService } from '@core/application/use-cases/habit.service';
import { FocusService } from '@core/application/use-cases/focus.service';
import { ProductivityController } from '@infrastructure/transport/rest/controllers/productivity.controller';
import { MediaModule } from '@infrastructure/media/media.module';

@Module({
  imports: [AuthModule, PersistenceModule, SyncModule, QueueModule, MediaModule],
  controllers: [ProductivityController],
  providers: [TaskService, HabitService, FocusService],
  exports: [TaskService, HabitService, FocusService],
})
export class ProductivityModule {}
