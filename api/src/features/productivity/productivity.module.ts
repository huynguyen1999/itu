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
import { TOKENS } from '@core/application/constants/tokens';

@Module({
  imports: [AuthModule, PersistenceModule, SyncModule, QueueModule, MediaModule],
  controllers: [ProductivityController],
  providers: [
    {
      provide: TaskService,
      useFactory: (repo, invalidationNotifier, devices, queue) => new TaskService(repo, invalidationNotifier, devices, queue),
      inject: [
        TOKENS.PRODUCTIVITY_REPOSITORY,
        { token: TOKENS.SYNC_INVALIDATION_NOTIFIER, optional: true },
        { token: TOKENS.SYNC_DEVICE_REPOSITORY, optional: true },
        { token: TOKENS.QUEUE_JOB_HANDLER, optional: true },
      ],
    },
    {
      provide: HabitService,
      useFactory: (repo, invalidationNotifier, devices, queue) => new HabitService(repo, invalidationNotifier, devices, queue),
      inject: [
        TOKENS.PRODUCTIVITY_REPOSITORY,
        { token: TOKENS.SYNC_INVALIDATION_NOTIFIER, optional: true },
        { token: TOKENS.SYNC_DEVICE_REPOSITORY, optional: true },
        { token: TOKENS.QUEUE_JOB_HANDLER, optional: true },
      ],
    },
    {
      provide: FocusService,
      useFactory: (repo, invalidationNotifier, devices, queue, media) =>
        new FocusService(repo, invalidationNotifier, devices, queue, media),
      inject: [
        TOKENS.PRODUCTIVITY_REPOSITORY,
        { token: TOKENS.SYNC_INVALIDATION_NOTIFIER, optional: true },
        { token: TOKENS.SYNC_DEVICE_REPOSITORY, optional: true },
        { token: TOKENS.QUEUE_JOB_HANDLER, optional: true },
        { token: TOKENS.MEDIA_STORAGE, optional: true },
      ],
    },
  ],
  exports: [TaskService, HabitService, FocusService],
})
export class ProductivityModule {}
