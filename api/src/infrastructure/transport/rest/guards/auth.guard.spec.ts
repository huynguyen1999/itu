import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { IUserRepository } from '@core/application/ports/out/repositories.port';
import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization: 'Bearer access-token' },
      }),
    }),
  } as unknown as ExecutionContext;
  let jwt: jest.Mocked<JwtService>;
  let config: jest.Mocked<ConfigService>;
  let users: jest.Mocked<IUserRepository>;
  let guard: AuthGuard;

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1' }) } as unknown as jest.Mocked<JwtService>;
    config = { getOrThrow: jest.fn().mockReturnValue('secret') } as unknown as jest.Mocked<ConfigService>;
    users = { findById: jest.fn() } as unknown as jest.Mocked<IUserRepository>;
    guard = new AuthGuard(jwt, config, users);
  });

  it('allows an active user with a valid access token', async () => {
    users.findById.mockResolvedValue({
      id: 'user-1',
      email: 'learner@example.com',
      createdAt: new Date(),
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects a banned user even when the access token is valid', async () => {
    users.findById.mockResolvedValue({
      id: 'user-1',
      email: 'learner@example.com',
      createdAt: new Date(),
      bannedAt: new Date(),
    });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
