import { SyncService } from './sync.service';
import { ISyncRepository } from '@core/application/ports/out/sync-repository.port';
import { ISyncDeviceRepository } from '@core/application/ports/out/repositories.port';
import { IQueueJobHandler, ISyncInvalidationNotifier } from '@core/application/ports/out/services.port';
import { InvalidSyncMutationException } from '@core/domain/exceptions';
import { SyncDevicePlatform } from '@core/domain/enums';

describe('SyncService', () => {
  const now = new Date('2026-07-16T10:45:00.000Z');

  it('applies mutations, enqueues AI jobs, and returns repository changes', async () => {
    const syncRepository: jest.Mocked<ISyncRepository> = {
      applyMutations: jest.fn().mockResolvedValue({
        acknowledgedMutationIds: ['mutation-1'],
        conflicts: [],
        aiJobsToEnqueue: [
          { id: 'job-card', kind: 'ai.card_generation' },
          { id: 'job-feedback', kind: 'ai.session_feedback' },
        ],
      }),
      changesSince: jest.fn().mockResolvedValue({
        cursor: '42',
        changes: [
          {
            cursor: 42,
            resourceType: 'deck',
            resourceId: 'deck-1',
            operation: 'UPSERT',
            resource: { id: 'deck-1' },
            complete: true,
          },
        ],
      }),
      currentCursor: jest.fn().mockResolvedValue('42'),
    };
    const queue: jest.Mocked<IQueueJobHandler> = {
      enqueueCardSuggestions: jest.fn().mockResolvedValue(undefined),
      enqueueSessionFeedback: jest.fn().mockResolvedValue(undefined),
      enqueueScheduledJob: jest.fn().mockResolvedValue(undefined),
      enqueueSyncInvalidation: jest.fn().mockResolvedValue(undefined),
    };
    const devices: jest.Mocked<ISyncDeviceRepository> = {
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      listNotificationTargets: jest.fn().mockResolvedValue([
        {
          id: 'device-2',
          userId: 'user-1',
          platform: SyncDevicePlatform.WEB,
          pushToken: null,
          lastSeenAt: now,
          lastKnownSyncCursor: '40',
          createdAt: now,
          updatedAt: now,
        },
      ]),
    };
    const invalidationNotifier: jest.Mocked<ISyncInvalidationNotifier> = {
      notifySyncAvailable: jest.fn().mockResolvedValue(undefined),
    };

    const service = new SyncService(syncRepository, queue, devices, invalidationNotifier);
    const result = await service.synchronize('user-1', 'device-1', 'client-instance-1', '10', [
      {
        id: 'mutation-1',
        kind: 'deck.create',
        entityId: 'deck-1',
        payload: { title: 'Deck' },
        occurredAt: '2026-07-13T00:00:00.000Z',
      },
    ]);

    expect(syncRepository.applyMutations).toHaveBeenCalledWith('user-1', 'device-1', expect.any(Array));
    expect(queue.enqueueCardSuggestions).toHaveBeenCalledWith('job-card');
    expect(queue.enqueueSessionFeedback).toHaveBeenCalledWith('job-feedback');
    expect(syncRepository.changesSince).toHaveBeenCalledWith('user-1', 10);
    expect(devices.update).toHaveBeenCalledWith('user-1', 'device-1', { lastKnownSyncCursor: '42' });
    expect(devices.listNotificationTargets).toHaveBeenCalledWith('user-1', 'device-1');
    expect(invalidationNotifier.notifySyncAvailable).toHaveBeenCalledWith({
      userId: 'user-1',
      originDeviceId: 'device-1',
      originClientInstanceId: 'client-instance-1',
      cursor: '42',
      targets: [{ deviceId: 'device-2', platform: SyncDevicePlatform.WEB, pushToken: null }],
    });
    expect(result).toEqual({
      acknowledgedMutationIds: ['mutation-1'],
      cursor: '42',
      lastSyncTime: expect.any(String),
      changes: [{ cursor: 42, entityType: 'deck', entityId: 'deck-1', deleted: false, data: { id: 'deck-1' } }],
      conflicts: [],
    });
  });

  it('pushes mutations without advancing the downloaded device cursor', async () => {
    const syncRepository: jest.Mocked<ISyncRepository> = {
      applyMutations: jest.fn().mockResolvedValue({
        acknowledgedMutationIds: ['mutation-1'],
        conflicts: [],
        aiJobsToEnqueue: [],
      }),
      changesSince: jest.fn(),
      currentCursor: jest.fn().mockResolvedValue('51'),
    };
    const devices = createDevices();
    devices.listNotificationTargets.mockResolvedValue([]);
    const service = new SyncService(syncRepository, createQueue(), devices, createNotifier());

    const result = await service.pushMutations('user-1', 'device-1', 'client-1', [
      {
        id: 'mutation-1',
        kind: 'task.update',
        entityId: 'task-1',
        payload: { title: 'Changed' },
        occurredAt: '2026-07-25T00:00:00.000Z',
      },
    ]);

    expect(result.latestServerCursor).toBe('51');
    expect(devices.update).not.toHaveBeenCalled();
    expect(syncRepository.changesSince).not.toHaveBeenCalled();
  });

  it('pulls changes and advances only the requesting device cursor', async () => {
    const syncRepository: jest.Mocked<ISyncRepository> = {
      applyMutations: jest.fn(),
      changesSince: jest.fn().mockResolvedValue({ cursor: '52', lastSyncTime: now.toISOString(), changes: [] }),
      currentCursor: jest.fn(),
    };
    const devices = createDevices();
    const service = new SyncService(syncRepository, createQueue(), devices, createNotifier());

    await service.pullChanges('user-1', 'device-1', '51');

    expect(syncRepository.changesSince).toHaveBeenCalledWith('user-1', 51);
    expect(devices.update).toHaveBeenCalledWith('user-1', 'device-1', { lastKnownSyncCursor: '52' });
    expect(syncRepository.applyMutations).not.toHaveBeenCalled();
  });

  it('rejects invalid cursors before applying mutations', async () => {
    const syncRepository: jest.Mocked<ISyncRepository> = {
      applyMutations: jest.fn(),
      changesSince: jest.fn(),
      currentCursor: jest.fn(),
    };
    const queue: jest.Mocked<IQueueJobHandler> = {
      enqueueCardSuggestions: jest.fn(),
      enqueueSessionFeedback: jest.fn(),
      enqueueScheduledJob: jest.fn(),
      enqueueSyncInvalidation: jest.fn(),
    };
    const devices: jest.Mocked<ISyncDeviceRepository> = {
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      listNotificationTargets: jest.fn(),
    };
    const invalidationNotifier: jest.Mocked<ISyncInvalidationNotifier> = {
      notifySyncAvailable: jest.fn(),
    };

    const service = new SyncService(syncRepository, queue, devices, invalidationNotifier);

    await expect(service.synchronize('user-1', 'device-1', 'client-instance-1', '-1', [])).rejects.toBeInstanceOf(
      InvalidSyncMutationException,
    );
    expect(syncRepository.applyMutations).not.toHaveBeenCalled();
  });

  it('does not emit invalidation when there are no writes', async () => {
    const syncRepository: jest.Mocked<ISyncRepository> = {
      applyMutations: jest.fn().mockResolvedValue({
        acknowledgedMutationIds: [],
        conflicts: [],
        aiJobsToEnqueue: [],
      }),
      changesSince: jest.fn().mockResolvedValue({
        cursor: '42',
        changes: [],
      }),
      currentCursor: jest.fn(),
    };
    const queue: jest.Mocked<IQueueJobHandler> = {
      enqueueCardSuggestions: jest.fn(),
      enqueueSessionFeedback: jest.fn(),
      enqueueScheduledJob: jest.fn(),
      enqueueSyncInvalidation: jest.fn(),
    };
    const devices: jest.Mocked<ISyncDeviceRepository> = {
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      listNotificationTargets: jest.fn(),
    };
    const invalidationNotifier: jest.Mocked<ISyncInvalidationNotifier> = {
      notifySyncAvailable: jest.fn(),
    };

    const service = new SyncService(syncRepository, queue, devices, invalidationNotifier);

    await service.synchronize('user-1', 'device-1', 'client-instance-1', '10', []);

    expect(devices.listNotificationTargets).not.toHaveBeenCalled();
    expect(invalidationNotifier.notifySyncAvailable).not.toHaveBeenCalled();
  });

  function createQueue(): jest.Mocked<IQueueJobHandler> {
    return {
      enqueueCardSuggestions: jest.fn(),
      enqueueSessionFeedback: jest.fn(),
      enqueueScheduledJob: jest.fn(),
      enqueueSyncInvalidation: jest.fn(),
    };
  }

  function createDevices(): jest.Mocked<ISyncDeviceRepository> {
    return {
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      listNotificationTargets: jest.fn(),
    };
  }

  function createNotifier(): jest.Mocked<ISyncInvalidationNotifier> {
    return {
      notifySyncAvailable: jest.fn(),
    };
  }
});
