import { AuthService } from './auth.service';
import { AUTH_CONSTANTS, AUTH_ERROR_CODES } from '@core/application/constants/app.constants';
import type {
  IOAuthHandoffRepository,
  IRefreshSessionRepository,
  IUserRepository,
} from '@core/application/ports/out/repositories.port';
import type { IAccessRepository } from '@core/application/ports/out/access-repository.port';
import type { GoogleOAuthPort } from '@core/application/ports/out/google-oauth.port';
import type { IPasswordHasher, IQueueJobHandler, ITokenService } from '@core/application/ports/out/services.port';
import { InvalidCredentialsException, TermsNotAcceptedException } from '@core/domain/exceptions';
import type { UserModel } from '@core/domain/models';

describe('AuthService', () => {
  let service: AuthService;
  let usersMock: jest.Mocked<IUserRepository>;
  let hasherMock: jest.Mocked<IPasswordHasher>;
  let tokensMock: jest.Mocked<ITokenService>;
  let queueMock: jest.Mocked<IQueueJobHandler>;
  let refreshSessionsMock: jest.Mocked<IRefreshSessionRepository>;
  let oauthHandoffsMock: jest.Mocked<IOAuthHandoffRepository>;
  let accessMock: jest.Mocked<IAccessRepository>;
  let googleOAuthMock: jest.Mocked<GoogleOAuthPort>;

  beforeEach(() => {
    usersMock = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
      findByIdentifier: jest.fn(),
      create: jest.fn(),
      updateProfile: jest.fn(),
      updatePassword: jest.fn(),
      exportData: jest.fn(),
      delete: jest.fn(),
      hardDelete: jest.fn(),
      scheduleDeletion: jest.fn(),
      upsertGoogleUser: jest.fn(),
    } as any;

    hasherMock = {
      hash: jest.fn(),
      compare: jest.fn(),
    } as any;

    tokensMock = {
      signAccessToken: jest.fn(),
      signRefreshToken: jest.fn(),
      verifyRefreshToken: jest.fn(),
      signRegisterToken: jest.fn(),
      verifyRegisterToken: jest.fn(),
    } as any;

    queueMock = {
      enqueueCardSuggestions: jest.fn(),
      enqueueSessionFeedback: jest.fn(),
      enqueueReviewInsights: jest.fn(),
      enqueueScheduledJob: jest.fn().mockResolvedValue(undefined),
      enqueueSyncInvalidation: jest.fn().mockResolvedValue(undefined),
    };

    refreshSessionsMock = {
      create: jest.fn().mockResolvedValue(undefined),
      findByHash: jest.fn(),
      rotate: jest.fn().mockResolvedValue(true),
      recoverRotation: jest.fn().mockResolvedValue(true),
      revokeById: jest.fn().mockResolvedValue(undefined),
      revokeUserSessions: jest.fn().mockResolvedValue(undefined),
    };
    oauthHandoffsMock = {
      create: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn(),
    };
    accessMock = {
      getUserAccess: jest.fn().mockResolvedValue({ roles: [], permissions: [] }),
      assignDefaultRoles: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IAccessRepository>;
    googleOAuthMock = {
      authorizationUrl: jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth'),
      fetchProfile: jest.fn(),
    };

    service = new AuthService(
      usersMock,
      hasherMock,
      tokensMock,
      queueMock,
      refreshSessionsMock,
      oauthHandoffsMock,
      accessMock,
      googleOAuthMock,
    );
  });

  it('delegates the authorization-code exchange through the Google OAuth port', async () => {
    googleOAuthMock.fetchProfile.mockResolvedValue({
      email: 'new@example.com',
      displayName: 'New User',
      providerUserId: 'google-123',
    });
    usersMock.findByEmail.mockResolvedValue(null);
    tokensMock.signRegisterToken.mockResolvedValue('mock-register-token');

    await expect(service.loginWithGoogleCode('authorization-code')).resolves.toEqual({
      type: 'register',
      registerToken: 'mock-register-token',
    });
    expect(googleOAuthMock.fetchProfile).toHaveBeenCalledWith('authorization-code');
  });

  describe('loginWithGoogle', () => {
    it('returns a registerToken if the user does not exist in the database', async () => {
      usersMock.findByEmail.mockResolvedValue(null);
      tokensMock.signRegisterToken.mockResolvedValue('mock-register-token');

      const result = await service.loginWithGoogle({
        email: 'new@example.com',
        displayName: 'New User',
        providerUserId: 'google-123',
      });

      expect(usersMock.findByEmail).toHaveBeenCalledWith('new@example.com');
      expect(tokensMock.signRegisterToken).toHaveBeenCalledWith({
        email: 'new@example.com',
        displayName: 'New User',
        providerUserId: 'google-123',
      });
      expect(result).toEqual({
        type: 'register',
        registerToken: 'mock-register-token',
      });
    });

    it('returns a session success and links/upserts user if user exists', async () => {
      const existingUser: UserModel = {
        id: 'user-123',
        email: 'existing@example.com',
        displayName: 'Existing User',
        createdAt: new Date(),
      };
      usersMock.findByEmail.mockResolvedValue(existingUser);
      usersMock.upsertGoogleUser.mockResolvedValue(existingUser);
      tokensMock.signAccessToken.mockResolvedValue('access-token');
      tokensMock.signRefreshToken.mockResolvedValue('refresh-token');

      const result = await service.loginWithGoogle({
        email: 'existing@example.com',
        displayName: 'Existing User',
        providerUserId: 'google-123',
      });

      expect(usersMock.findByEmail).toHaveBeenCalledWith('existing@example.com');
      expect(usersMock.upsertGoogleUser).toHaveBeenCalledWith({
        email: 'existing@example.com',
        displayName: 'Existing User',
        providerUserId: 'google-123',
      });
      expect(result).toEqual({
        type: 'success',
        user: {
          id: 'user-123',
          email: 'existing@example.com',
          displayName: 'Existing User',
          roles: [],
          permissions: [],
        },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(refreshSessionsMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      );
    });
  });

  describe('login', () => {
    it('rejects a banned user', async () => {
      usersMock.findByIdentifier.mockResolvedValue({
        id: 'user-1',
        email: 'banned@example.com',
        passwordHash: 'hash',
        createdAt: new Date(),
        bannedAt: new Date(),
      });

      await expect(service.login({ email: 'banned@example.com', password: 'password123' })).rejects.toThrow(
        InvalidCredentialsException,
      );
      expect(hasherMock.compare).not.toHaveBeenCalled();
    });
  });

  describe('registerWithGoogle', () => {
    it('throws TermsNotAcceptedException if termsAgreed is false', async () => {
      await expect(
        service.registerWithGoogle({
          registerToken: 'some-token',
          termsAgreed: false,
        }),
      ).rejects.toThrow(TermsNotAcceptedException);
    });

    it('verifies register token and upserts Google user if terms are agreed', async () => {
      const profile = {
        email: 'new@example.com',
        displayName: 'New User',
        providerUserId: 'google-123',
      };
      tokensMock.verifyRegisterToken.mockResolvedValue(profile);

      const createdUser: UserModel = {
        id: 'user-456',
        email: 'new@example.com',
        displayName: 'New User',
        createdAt: new Date(),
      };
      usersMock.upsertGoogleUser.mockResolvedValue(createdUser);
      tokensMock.signAccessToken.mockResolvedValue('access-token');
      tokensMock.signRefreshToken.mockResolvedValue('refresh-token');

      const result = await service.registerWithGoogle({
        registerToken: 'valid-token',
        termsAgreed: true,
      });

      expect(tokensMock.verifyRegisterToken).toHaveBeenCalledWith('valid-token');
      expect(usersMock.upsertGoogleUser).toHaveBeenCalledWith({
        email: 'new@example.com',
        displayName: 'New User',
        providerUserId: 'google-123',
      });
      expect(result).toEqual({
        user: {
          id: 'user-456',
          email: 'new@example.com',
          displayName: 'New User',
          roles: [],
          permissions: [],
        },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(refreshSessionsMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-456',
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      );
    });
  });

  describe('refresh', () => {
    const user: UserModel = {
      id: 'user-1',
      email: 'user@example.com',
      createdAt: new Date(),
    };

    beforeEach(() => {
      usersMock.findById.mockResolvedValue(user);
      tokensMock.verifyRefreshToken.mockResolvedValue({ sub: user.id, email: user.email!, jti: 'session-1' });
      tokensMock.signAccessToken.mockResolvedValue('next-access-token');
      tokensMock.signRefreshToken.mockResolvedValue('next-refresh-token');
      refreshSessionsMock.findByHash.mockResolvedValue({
        id: 'session-1',
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        rotationGraceUntil: null,
        rotationRecoveryUsedAt: null,
      });
    });

    it('rotates the session and gives it a 180-day sliding expiration', async () => {
      const before = Date.now();

      await service.refresh('refresh-token');

      const [, next] = refreshSessionsMock.rotate.mock.calls[0];
      expect(next.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 180 * 24 * 60 * 60 * 1000);
      expect(next.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 180 * 24 * 60 * 60 * 1000);
    });

    it('returns a stable expired-token error', async () => {
      tokensMock.verifyRefreshToken.mockRejectedValue(
        Object.assign(new Error('expired'), { name: 'TokenExpiredError' }),
      );

      await expect(service.refresh('expired-token')).rejects.toMatchObject({
        code: AUTH_ERROR_CODES.refreshTokenExpired,
        status: 401,
      });
    });

    it('recovers one replay of a just-rotated token without plaintext persistence', async () => {
      refreshSessionsMock.findByHash.mockResolvedValue({
        id: 'session-1',
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        rotationGraceUntil: new Date(Date.now() + AUTH_CONSTANTS.refreshRotationGraceMs),
        rotationRecoveryUsedAt: null,
      });

      await service.refresh('old-refresh-token');

      expect(refreshSessionsMock.recoverRotation).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          tokenHash: expect.any(String),
        }),
      );
      expect(refreshSessionsMock.rotate).not.toHaveBeenCalled();
    });

    it('rejects a rotated token after the grace period', async () => {
      refreshSessionsMock.findByHash.mockResolvedValue({
        id: 'session-1',
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        rotationGraceUntil: new Date(Date.now() - 1),
        rotationRecoveryUsedAt: null,
      });

      await expect(service.refresh('old-refresh-token')).rejects.toMatchObject({
        code: AUTH_ERROR_CODES.refreshTokenRevoked,
        status: 401,
      });
      expect(refreshSessionsMock.recoverRotation).not.toHaveBeenCalled();
    });

    it('rejects a replay that loses the single recovery claim', async () => {
      refreshSessionsMock.findByHash.mockResolvedValue({
        id: 'session-1',
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        rotationGraceUntil: new Date(Date.now() + AUTH_CONSTANTS.refreshRotationGraceMs),
        rotationRecoveryUsedAt: null,
      });
      refreshSessionsMock.recoverRotation.mockResolvedValue(false);

      await expect(service.refresh('old-refresh-token')).rejects.toMatchObject({
        code: AUTH_ERROR_CODES.refreshTokenRevoked,
        status: 401,
      });
    });

    it('rejects an invalid refresh token with a stable error', async () => {
      refreshSessionsMock.findByHash.mockResolvedValue(null);

      await expect(service.refresh('invalid-token')).rejects.toMatchObject({
        code: AUTH_ERROR_CODES.refreshTokenInvalid,
        status: 401,
      });
    });
  });

  describe('session invalidation', () => {
    it('revokes every refresh session after a password change', async () => {
      usersMock.findById.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: 'old-hash',
        createdAt: new Date(),
      });
      hasherMock.compare.mockResolvedValue(true);
      hasherMock.hash.mockResolvedValue('new-hash');

      await service.changePassword('user-1', { currentPassword: 'old', newPassword: 'new-password' });

      expect(usersMock.updatePassword).toHaveBeenCalledWith('user-1', 'new-hash');
      expect(refreshSessionsMock.revokeUserSessions).toHaveBeenCalledWith('user-1');
    });

    it('revokes only the refresh session presented to logout', async () => {
      tokensMock.verifyRefreshToken.mockResolvedValue({ sub: 'user-1', email: 'user@example.com', jti: 'session-1' });

      await service.logout('refresh-token');

      expect(refreshSessionsMock.revokeById).toHaveBeenCalledWith('session-1');
      expect(refreshSessionsMock.revokeUserSessions).not.toHaveBeenCalled();
    });
  });

  describe('OAuth handoff', () => {
    it('does not persist issued tokens in the handoff payload', async () => {
      tokensMock.verifyRefreshToken.mockResolvedValue({ sub: 'user-1', email: 'user@example.com', jti: 'session-1' });

      await service.createOAuthHandoff({
        user: {
          id: 'user-1',
          email: 'user@example.com',
          username: null,
          displayName: 'User',
          roles: [],
          permissions: [],
        },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      expect(oauthHandoffsMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: { type: 'success', userId: 'user-1', refreshSessionId: 'session-1' },
        }),
      );
      expect(JSON.stringify(oauthHandoffsMock.create.mock.calls[0][0].payload)).not.toContain('refresh-token');
    });

    it('revokes the provisional session and issues a fresh pair on exchange', async () => {
      oauthHandoffsMock.consume.mockResolvedValue({
        payload: { type: 'success', userId: 'user-1', refreshSessionId: 'session-1' },
      });
      usersMock.findById.mockResolvedValue({ id: 'user-1', email: 'user@example.com', createdAt: new Date() });
      tokensMock.signAccessToken.mockResolvedValue('new-access-token');
      tokensMock.signRefreshToken.mockResolvedValue('new-refresh-token');

      const result = await service.exchangeOAuthHandoff('handoff-code');

      expect(refreshSessionsMock.revokeById).toHaveBeenCalledWith('session-1');
      expect(result).toEqual(
        expect.objectContaining({ accessToken: 'new-access-token', refreshToken: 'new-refresh-token' }),
      );
    });
  });

  describe('deleteAccount', () => {
    it('schedules durable account deletion instead of hard deleting immediately', async () => {
      const user: UserModel = {
        id: 'user-1',
        email: 'demo@itu.app',
        passwordHash: 'hash',
        createdAt: new Date(),
      };
      usersMock.findById.mockResolvedValue(user);
      hasherMock.compare.mockResolvedValue(true);
      usersMock.scheduleDeletion.mockResolvedValue({
        userId: user.id,
        jobId: 'job-1',
        runAt: new Date('2026-08-13T00:00:00.000Z'),
      });

      await service.deleteAccount(user.id, 'password123');

      expect(usersMock.scheduleDeletion).toHaveBeenCalledWith(user.id, expect.any(Date));
      expect(usersMock.hardDelete).not.toHaveBeenCalled();
      expect(refreshSessionsMock.revokeUserSessions).toHaveBeenCalledWith(user.id);
      expect(queueMock.enqueueScheduledJob).toHaveBeenCalledWith('job-1');
    });
  });
});
