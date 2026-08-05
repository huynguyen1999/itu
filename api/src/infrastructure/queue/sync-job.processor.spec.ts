import type { IProductivityRepository, ISyncDeviceRepository } from '@core/application/ports/out/repositories.port';
import type { ILogger, ISyncInvalidationNotifier, SyncQueueJob } from '@core/application/ports/out/services.port';
import { SyncJobProcessor } from './sync-job.processor';

describe('SyncJobProcessor', () => {
  let repo: jest.Mocked<IProductivityRepository>;
  let devices: jest.Mocked<ISyncDeviceRepository>;
  let invalidationNotifier: jest.Mocked<ISyncInvalidationNotifier>;
  let logger: jest.Mocked<ILogger>;
  let processor: SyncJobProcessor;

  beforeEach(() => {
    repo = {
      recordSyncChange: jest.fn().mockResolvedValue({ cursor: 42n }),
    } as unknown as jest.Mocked<IProductivityRepository>;

    devices = {
      listNotificationTargets: jest.fn().mockResolvedValue([{ id: 'device-1', platform: 'WEB', pushToken: null }]),
    } as unknown as jest.Mocked<ISyncDeviceRepository>;

    invalidationNotifier = {
      notifySyncAvailable: jest.fn().mockResolvedValue(undefined),
    };

    logger = {
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    processor = new SyncJobProcessor(repo, devices, invalidationNotifier, logger);
  });

  it('records sync change and dispatches invalidation notification when target devices exist', async () => {
    const job: SyncQueueJob = {
      type: 'sync-invalidation',
      jobId: 'job-100',
      userId: 'user-1',
      entityType: 'task',
      entityId: 'task-1',
      operation: 'UPSERT',
      data: { title: 'Test Task' },
      originDeviceId: 'device-0',
      originClientInstanceId: 'inst-0',
    };

    await processor.process(job);

    expect(repo.recordSyncChange).toHaveBeenCalledWith('user-1', 'task', 'task-1', 'UPSERT', { title: 'Test Task' });
    expect(devices.listNotificationTargets).toHaveBeenCalledWith('user-1', 'device-0');
    expect(invalidationNotifier.notifySyncAvailable).toHaveBeenCalledWith({
      userId: 'user-1',
      originDeviceId: 'device-0',
      originClientInstanceId: 'inst-0',
      cursor: '42',
      targets: [{ deviceId: 'device-1', platform: 'WEB', pushToken: null }],
    });
    expect(logger.debug).toHaveBeenCalledWith(
      'Sync invalidation job processed via RabbitMQ',
      expect.objectContaining({ userId: 'user-1', entityType: 'task', entityId: 'task-1', cursor: '42' }),
    );
  });
});
