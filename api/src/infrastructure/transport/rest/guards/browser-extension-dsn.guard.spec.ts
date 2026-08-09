import { UnauthorizedException } from '@nestjs/common';
import { BrowserExtensionDsnGuard } from './browser-extension-dsn.guard';

describe('BrowserExtensionDsnGuard', () => {
  function context(authorization?: string) {
    const request = { headers: { authorization } } as any;
    return {
      request,
      context: { switchToHttp: () => ({ getRequest: () => request }) } as any,
    };
  }

  it('accepts DSN authentication and attaches its user', async () => {
    const usage = { authenticateBrowserExtensionDsn: jest.fn().mockResolvedValue({ userId: 'user-1' }) } as any;
    const { request, context: executionContext } = context('DSN itu_dsn_secret');
    await expect(new BrowserExtensionDsnGuard(usage).canActivate(executionContext)).resolves.toBe(true);
    expect(request.browserExtension).toEqual({ userId: 'user-1' });
  });

  it('rejects bearer and unknown DSN credentials', async () => {
    const usage = { authenticateBrowserExtensionDsn: jest.fn().mockResolvedValue(null) } as any;
    await expect(
      new BrowserExtensionDsnGuard(usage).canActivate(context('Bearer login-token').context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      new BrowserExtensionDsnGuard(usage).canActivate(context('DSN unknown').context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
