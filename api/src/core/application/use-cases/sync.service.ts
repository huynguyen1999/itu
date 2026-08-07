import { Inject, Injectable } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import type { ISyncUseCase, SyncMutation, SyncResult } from '@core/application/ports/in/sync-use-case.port';
import type { ISyncRepository } from '@core/application/ports/out/sync-repository.port';
import type { ISyncDeviceRepository } from '@core/application/ports/out/repositories.port';
import type { IQueueJobHandler, ISyncInvalidationNotifier } from '@core/application/ports/out/services.port';
import { InvalidSyncMutationException } from '@core/domain/exceptions';

@Injectable()
export class SyncService implements ISyncUseCase {
  constructor(
    @Inject(TOKENS.SYNC_REPOSITORY) private readonly syncRepository: ISyncRepository,
    @Inject(TOKENS.QUEUE_JOB_HANDLER) private readonly queue: IQueueJobHandler,
    @Inject(TOKENS.SYNC_DEVICE_REPOSITORY) private readonly devices: ISyncDeviceRepository,
    @Inject(TOKENS.SYNC_INVALIDATION_NOTIFIER) private readonly invalidationNotifier: ISyncInvalidationNotifier,
  ) {}

  async synchronize(
    userId: string,
    deviceId: string,
    clientInstanceId: string,
    cursorText: string | undefined,
    mutations: SyncMutation[],
  ): Promise<SyncResult> {
    const cursor = this.parseCursor(cursorText);

    const applied = await this.syncRepository.applyMutations(userId, deviceId, mutations);

    await this.enqueueJobs(applied.aiJobsToEnqueue);

    const pulled = await this.syncRepository.changesSince(userId, cursor);

    await this.devices.update(userId, deviceId, { lastKnownSyncCursor: pulled.cursor });

    if (mutations.length > 0) {
      await this.notifyOtherDevices(userId, deviceId, clientInstanceId, pulled.cursor);
    }

    return {
      acknowledgedMutationIds: applied.acknowledgedMutationIds,
      cursor: pulled.cursor,
      lastSyncTime: pulled.lastSyncTime || new Date().toISOString(),
      changes: pulled.changes.map((change) => ({
        cursor: change.cursor,
        entityType: change.resourceType,
        entityId: change.resourceId,
        deleted: change.operation === 'DELETE',
        data: change.resource,
        complete: change.complete,
      })),
      conflicts: applied.conflicts,
      mutationOutcomes: applied.mutationOutcomes,
    };
  }

  private parseCursor(value?: string): number {
    if (!value) return 0;
    const cursor = Number(value);
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new InvalidSyncMutationException('Invalid sync cursor');
    return cursor;
  }

  private async enqueueJobs(jobs: Array<{ id: string; kind: string }>): Promise<void> {
    for (const job of jobs) {
      if (job.kind === 'ai.card_generation') await this.queue.enqueueCardSuggestions(job.id);
      if (job.kind === 'ai.session_feedback') await this.queue.enqueueSessionFeedback(job.id);
    }
  }

  private async notifyOtherDevices(
    userId: string,
    originDeviceId: string,
    originClientInstanceId: string,
    cursor: string,
  ): Promise<void> {
    const targets = await this.devices.listNotificationTargets(userId, originDeviceId);
    await this.invalidationNotifier.notifySyncAvailable({
      userId,
      originDeviceId,
      originClientInstanceId,
      cursor,
      targets: targets.map((target) => ({
        deviceId: target.id,
        platform: target.platform,
        pushToken: target.pushToken,
      })),
    });
  }
}
