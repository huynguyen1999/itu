import { ReviewAutomationScheduler } from './review-automation.scheduler';

describe('ReviewAutomationScheduler', () => {
  it('runs review automation for every active user with their stored timezone', async () => {
    const users = {
      listUsers: jest.fn().mockResolvedValue([
        { userId: 'user-1', timezone: 'America/Los_Angeles' },
        { userId: 'user-2', timezone: 'Asia/Ho_Chi_Minh' },
      ]),
    };
    const automation = { ensureReviews: jest.fn().mockResolvedValue(undefined) };
    const logger = { warn: jest.fn() };
    const scheduler = new ReviewAutomationScheduler(users as any, automation as any, logger as any);
    const now = new Date('2026-08-20T12:00:00Z');

    await scheduler.run(now);

    expect(automation.ensureReviews).toHaveBeenNthCalledWith(1, 'user-1', now, 'America/Los_Angeles');
    expect(automation.ensureReviews).toHaveBeenNthCalledWith(2, 'user-2', now, 'Asia/Ho_Chi_Minh');
  });

  it('logs one user failure without stopping the scan', async () => {
    const users = {
      listUsers: jest.fn().mockResolvedValue([{ userId: 'user-1' }, { userId: 'user-2' }]),
    };
    const automation = {
      ensureReviews: jest.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce(undefined),
    };
    const logger = { warn: jest.fn() };
    const scheduler = new ReviewAutomationScheduler(users as any, automation as any, logger as any);

    await scheduler.run();

    expect(automation.ensureReviews).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith('Review automation failed', expect.objectContaining({ userId: 'user-1' }));
  });
});
