import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IAccessRepository } from '@core/application/ports/out/access-repository.port';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'user-1' } }) }),
    getHandler: () => null,
    getClass: () => null,
  } as unknown as ExecutionContext;
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const access = { getUserAccess: jest.fn() } as unknown as jest.Mocked<IAccessRepository>;
  const guard = new PermissionsGuard(reflector, access);

  beforeEach(() => jest.clearAllMocks());

  it('allows a user when every required permission is effective through their roles', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['AI_USE']);
    access.getUserAccess.mockResolvedValue({ roles: ['A_CONFIGURED_ROLE'], permissions: ['AI_USE'] });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('denies a user when an effective permission is missing', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['AI_USE']);
    access.getUserAccess.mockResolvedValue({ roles: ['FREE'], permissions: [] });
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
