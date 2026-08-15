import { ScheduledJobStatus, ScheduledJobType } from '@core/domain/enums';
import type {
  IReminderRepository,
  IScheduledJobRepository,
  ITrashRepository,
  IUserRepository,
} from '@core/application/ports/out/repositories.port';
import type { ILogger, IMediaStorage } from '@core/application/ports/out/services.port';
import { ScheduledJobProcessor } from './scheduled-job.processor';

describe('ScheduledJobProcessor', () => {
  it('delivers a due task reminder and completes its scheduled job', async () => {
    const jobs = {
      markRunning: jest.fn().mockResolvedValue({
        id: 'job-1',
        userId: 'user-1',
        type: ScheduledJobType.TASK_REMINDER,
        status: ScheduledJobStatus.RUNNING,
        payload: { reminderId: 'reminder-1' },
        runAt: new Date(Date.now() - 1_000),
        attempts: 1,
        createdAt: new Date(),
      }),
      markCompleted: jest.fn(),
      markFailed: jest.fn(),
    } as unknown as jest.Mocked<IScheduledJobRepository>;
    const reminders = {
      deliver: jest.fn().mockResolvedValue(true),
    } as jest.Mocked<IReminderRepository>;
    const processor = new ScheduledJobProcessor(
      jobs,
      {} as IUserRepository,
      {} as ITrashRepository,
      reminders,
      {} as IMediaStorage,
      {} as ILogger,
    );

    await processor.process({ type: 'scheduled-job', jobId: 'job-1' });

    expect(reminders.deliver).toHaveBeenCalledWith('reminder-1');
    expect(jobs.markCompleted).toHaveBeenCalledWith('job-1');
    expect(jobs.markFailed).not.toHaveBeenCalled();
  });

  it('fails a malformed reminder job without delivering it', async () => {
    const jobs = {
      markRunning: jest.fn().mockResolvedValue({
        id: 'job-1',
        type: ScheduledJobType.TASK_REMINDER,
        status: ScheduledJobStatus.RUNNING,
        payload: {},
        runAt: new Date(Date.now() - 1_000),
        attempts: 1,
        createdAt: new Date(),
      }),
      markCompleted: jest.fn(),
      markFailed: jest.fn(),
    } as unknown as jest.Mocked<IScheduledJobRepository>;
    const reminders = { deliver: jest.fn() } as jest.Mocked<IReminderRepository>;
    const processor = new ScheduledJobProcessor(
      jobs,
      {} as IUserRepository,
      {} as ITrashRepository,
      reminders,
      {} as IMediaStorage,
      {} as ILogger,
    );

    await processor.process({ type: 'scheduled-job', jobId: 'job-1' });

    expect(reminders.deliver).not.toHaveBeenCalled();
    expect(jobs.markFailed).toHaveBeenCalledWith('job-1', 'Scheduled reminder payload is missing reminderId');
    expect(jobs.markCompleted).not.toHaveBeenCalled();
  });

  it('routes habit reminder jobs to the habit delivery workflow', async () => {
    const jobs = {
      markRunning: jest.fn().mockResolvedValue({
        id: 'job-1',
        type: ScheduledJobType.HABIT_REMINDER,
        status: ScheduledJobStatus.RUNNING,
        payload: { deliveryId: 'delivery-1' },
        runAt: new Date(Date.now() - 1_000),
        attempts: 1,
        createdAt: new Date(),
      }),
      markCompleted: jest.fn(),
      markFailed: jest.fn(),
    } as unknown as jest.Mocked<IScheduledJobRepository>;
    const reminders = {
      deliver: jest.fn(),
      deliverHabitReminder: jest.fn().mockResolvedValue(true),
    } as jest.Mocked<IReminderRepository>;
    const processor = new ScheduledJobProcessor(
      jobs,
      {} as IUserRepository,
      {} as ITrashRepository,
      reminders,
      {} as IMediaStorage,
      {} as ILogger,
    );

    await processor.process({ type: 'scheduled-job', jobId: 'job-1' });

    expect(reminders.deliverHabitReminder).toHaveBeenCalledWith('delivery-1');
    expect(jobs.markCompleted).toHaveBeenCalledWith('job-1');
    expect(jobs.markFailed).not.toHaveBeenCalled();
  });
});
