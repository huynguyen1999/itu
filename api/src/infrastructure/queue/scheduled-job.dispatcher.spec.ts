import { ScheduledJobStatus, ScheduledJobType } from '@core/domain/enums';
import type { IScheduledJobRepository } from '@core/application/ports/out/repositories.port';
import type { ILogger, IQueueJobHandler } from '@core/application/ports/out/services.port';
import { ScheduledJobDispatcher } from './scheduled-job.dispatcher';

describe('ScheduledJobDispatcher', () => {
  let jobs: jest.Mocked<IScheduledJobRepository>;
  let queue: jest.Mocked<IQueueJobHandler>;
  let logger: jest.Mocked<ILogger>;
  let dispatcher: ScheduledJobDispatcher;

  beforeEach(() => {
    jobs = {
      create: jest.fn(),
      findById: jest.fn(),
      claimPublishable: jest.fn(),
      markPublished: jest.fn(),
      markRunning: jest.fn(),
      markCompleted: jest.fn(),
      markFailed: jest.fn(),
      cancelUserJobs: jest.fn(),
    };
    queue = {
      enqueueCardSuggestions: jest.fn(),
      enqueueSessionFeedback: jest.fn(),
      enqueueReviewInsights: jest.fn(),
      enqueueScheduledJob: jest.fn(),
      enqueueSyncInvalidation: jest.fn(),
    };
    logger = {
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    dispatcher = new ScheduledJobDispatcher(jobs, queue, logger);
  });

  it('publishes claimed jobs and marks them published', async () => {
    jobs.claimPublishable.mockResolvedValue([
      {
        id: 'job-1',
        userId: 'user-1',
        type: ScheduledJobType.ACCOUNT_DELETE,
        status: ScheduledJobStatus.PUBLISHING,
        payload: { userId: 'user-1' },
        runAt: new Date(),
        attempts: 0,
        createdAt: new Date(),
      },
    ]);

    await dispatcher.dispatch();

    expect(queue.enqueueScheduledJob).toHaveBeenCalledWith('job-1');
    expect(jobs.markPublished).toHaveBeenCalledWith('job-1');
  });

  it('marks publish failures failed so the next dispatcher pass can recover them', async () => {
    jobs.claimPublishable.mockResolvedValue([
      {
        id: 'job-1',
        userId: 'user-1',
        type: ScheduledJobType.ACCOUNT_DELETE,
        status: ScheduledJobStatus.PUBLISHING,
        payload: { userId: 'user-1' },
        runAt: new Date(),
        attempts: 0,
        createdAt: new Date(),
      },
    ]);
    queue.enqueueScheduledJob.mockRejectedValue(new Error('RabbitMQ unavailable'));

    await dispatcher.dispatch();

    expect(jobs.markFailed).toHaveBeenCalledWith('job-1', 'RabbitMQ unavailable');
    expect(jobs.markPublished).not.toHaveBeenCalled();
  });

  it('logs and releases the dispatcher when claiming jobs fails', async () => {
    jobs.claimPublishable.mockRejectedValue(new Error('Unable to start a transaction in the given time.'));

    await expect(dispatcher.dispatch()).resolves.toBeUndefined();
    await dispatcher.dispatch();

    expect(jobs.claimPublishable).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith('Scheduled job dispatch skipped', {
      error: 'Unable to start a transaction in the given time.',
    });
    expect(queue.enqueueScheduledJob).not.toHaveBeenCalled();
  });
});
