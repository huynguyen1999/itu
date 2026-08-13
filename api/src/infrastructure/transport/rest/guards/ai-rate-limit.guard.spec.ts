import { ExecutionContext } from '@nestjs/common';
import type { IRateLimitRepository } from '@core/application/ports/out/repositories.port';
import { AiRateLimitGuard } from './ai-rate-limit.guard';

describe('AiRateLimitGuard', () => {
  const rateLimits = { consume: jest.fn() } as unknown as jest.Mocked<IRateLimitRepository>;
  const request = { method: 'GET', user: { sub: 'user-1' }, ip: '127.0.0.1' };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('does not rate-limit read-only job status polling', async () => {
    await expect(new AiRateLimitGuard(rateLimits).canActivate(context)).resolves.toBe(true);
    expect(rateLimits.consume).not.toHaveBeenCalled();
  });

  it('rate-limits AI generation requests', async () => {
    request.method = 'POST';
    rateLimits.consume.mockResolvedValue({ allowed: true, resetAt: new Date() });

    await expect(new AiRateLimitGuard(rateLimits).canActivate(context)).resolves.toBe(true);
    expect(rateLimits.consume).toHaveBeenCalledWith('ai:user-1', 60_000, 12);
  });
});
