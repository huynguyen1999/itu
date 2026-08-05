import { Module } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import { AuthModule } from '@features/auth/auth.module';
import { SyncModule } from '@features/sync/sync.module';
import { QueueModule } from '@infrastructure/queue/queue.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { IProductivityRepository, ISyncDeviceRepository } from '@core/application/ports/out/repositories.port';
import { IQueueJobHandler, ISyncInvalidationNotifier } from '@core/application/ports/out/services.port';
import { TaskService } from '@core/application/use-cases/task.service';
import { HabitService } from '@core/application/use-cases/habit.service';
import { FocusService } from '@core/application/use-cases/focus.service';
import { ProductivityController } from '@infrastructure/transport/rest/controllers/productivity.controller';
import { MediaModule } from '@infrastructure/media/media.module';

@Module({
  imports: [AuthModule, PersistenceModule, SyncModule, QueueModule, MediaModule],
  controllers: [ProductivityController],
  providers: [
    {
      provide: TaskService,
      useFactory: (
        repo: IProductivityRepository,
        invalidationNotifier: ISyncInvalidationNotifier,
        devices: ISyncDeviceRepository,
        queue: IQueueJobHandler,
      ) => new TaskService(repo, invalidationNotifier, devices, queue),
      inject: [
        TOKENS.PRODUCTIVITY_REPOSITORY,
        TOKENS.SYNC_INVALIDATION_NOTIFIER,
        TOKENS.SYNC_DEVICE_REPOSITORY,
        TOKENS.QUEUE_JOB_HANDLER,
      ],
    },
    {
      provide: HabitService,
      useFactory: (
        repo: IProductivityRepository,
        invalidationNotifier: ISyncInvalidationNotifier,
        devices: ISyncDeviceRepository,
        queue: IQueueJobHandler,
      ) => new HabitService(repo, invalidationNotifier, devices, queue),
      inject: [
        TOKENS.PRODUCTIVITY_REPOSITORY,
        TOKENS.SYNC_INVALIDATION_NOTIFIER,
        TOKENS.SYNC_DEVICE_REPOSITORY,
        TOKENS.QUEUE_JOB_HANDLER,
      ],
    },
    {
      provide: FocusService,
      useFactory: (
        repo: IProductivityRepository,
        invalidationNotifier: ISyncInvalidationNotifier,
        devices: ISyncDeviceRepository,
        queue: IQueueJobHandler,
        media: import('@core/application/ports/out/services.port').IMediaStorage,
      ) => new FocusService(repo, invalidationNotifier, devices, queue, media),
      inject: [
        TOKENS.PRODUCTIVITY_REPOSITORY,
        TOKENS.SYNC_INVALIDATION_NOTIFIER,
        TOKENS.SYNC_DEVICE_REPOSITORY,
        TOKENS.QUEUE_JOB_HANDLER,
        TOKENS.MEDIA_STORAGE,
      ],
    },
  ],
  exports: [TaskService, HabitService, FocusService],
})
export class ProductivityModule {}
