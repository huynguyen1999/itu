import { Inject, Injectable } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import type { IProductivityRepository, ISyncDeviceRepository } from '@core/application/ports/out/repositories.port';
import type { ILogger, ISyncInvalidationNotifier, SyncQueueJob } from '@core/application/ports/out/services.port';

@Injectable()
export class SyncJobProcessor {
  constructor(
    @Inject(TOKENS.PRODUCTIVITY_REPOSITORY)
    private readonly repo: IProductivityRepository,
    @Inject(TOKENS.SYNC_DEVICE_REPOSITORY)
    private readonly devices: ISyncDeviceRepository,
    @Inject(TOKENS.SYNC_INVALIDATION_NOTIFIER)
    private readonly invalidationNotifier: ISyncInvalidationNotifier,
    @Inject(TOKENS.LOGGER)
    private readonly logger: ILogger,
  ) {}

  async process(job: SyncQueueJob): Promise<void> {
    const change = await this.repo.recordSyncChange(job.userId, job.entityType, job.entityId, job.operation, job.data);

    const targets = await this.devices.listNotificationTargets(job.userId, job.originDeviceId ?? '');
    if (targets.length > 0) {
      await this.invalidationNotifier.notifySyncAvailable({
        userId: job.userId,
        originDeviceId: job.originDeviceId ?? '',
        originClientInstanceId: job.originClientInstanceId ?? '',
        cursor: String(change.cursor),
        targets: targets.map((t) => ({ deviceId: t.id, platform: t.platform, pushToken: t.pushToken })),
      });
    }

    this.logger.debug('Sync invalidation job processed via RabbitMQ', {
      userId: job.userId,
      entityType: job.entityType,
      entityId: job.entityId,
      cursor: String(change.cursor),
    });
  }
}
