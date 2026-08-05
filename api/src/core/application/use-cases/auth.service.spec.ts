import { AuthService } from './auth.service';
import type {
  IOAuthHandoffRepository,
  IRefreshSessionRepository,
  IUserRepository,
} from '@core/application/ports/out/repositories.port';
import type { IAccessRepository } from '@core/application/ports/out/access-repository.port';
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
      enqueueScheduledJob: jest.fn().mockResolvedValue(undefined),
      enqueueSyncInvalidation: jest.fn().mockResolvedValue(undefined),
    };

    refreshSessionsMock = {
      create: jest.fn().mockResolvedValue(undefined),
      findActiveByHash: jest.fn(),
      rotate: jest.fn().mockResolvedValue(undefined),
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

    service = new AuthService(
      usersMock,
      hasherMock,
      tokensMock,
      queueMock,
      refreshSessionsMock,
      oauthHandoffsMock,
      accessMock,
    );
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
