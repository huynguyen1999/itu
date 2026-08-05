import {
  DomainException,
  EntityNotFoundException,
  InvalidCredentialsException,
  TermsNotAcceptedException,
} from '@core/domain/exceptions';
import { createHash, randomBytes, randomUUID } from 'crypto';
import {
  IAuthUseCase,
  AuthResult,
  ChangePasswordCommand,
  GoogleLoginCommand,
  GoogleAuthResult,
  LoginCommand,
  RegisterCommand,
  UpdateProfileCommand,
} from '@core/application/ports/in/auth-use-case.port';
import {
  IOAuthHandoffRepository,
  IRefreshSessionRepository,
  IUserRepository,
} from '@core/application/ports/out/repositories.port';
import type { IAccessRepository } from '@core/application/ports/out/access-repository.port';
import { IPasswordHasher, IQueueJobHandler, ITokenService } from '@core/application/ports/out/services.port';
import { DELETION_CONSTANTS } from '@core/application/constants/app.constants';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OAUTH_HANDOFF_TTL_MS = 2 * 60 * 1000;

export class AuthService implements IAuthUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly hasher: IPasswordHasher,
    private readonly tokens: ITokenService,
    private readonly queue: IQueueJobHandler,
    private readonly refreshSessions: IRefreshSessionRepository,
    private readonly oauthHandoffs: IOAuthHandoffRepository,
    private readonly access: IAccessRepository,
  ) {}

  async register(command: RegisterCommand): Promise<AuthResult> {
    const email = command.email?.trim().toLowerCase();
    const username = command.username?.trim().toLowerCase();
    if (!email && !username) {
      throw new DomainException('Either email or username must be provided', 'IDENTIFIER_REQUIRED', 400);
    }
    if (email && (await this.users.findByEmail(email))) {
      throw new DomainException('Email already registered', 'DUPLICATE_EMAIL', 409);
    }
    if (username && (await this.users.findByUsername(username))) {
      throw new DomainException('Username already taken', 'DUPLICATE_USERNAME', 409);
    }

    const passwordHash = await this.hasher.hash(command.password);
    const user = await this.users.create({
      email: email || null,
      username: username || null,
      passwordHash,
      displayName: command.displayName,
    });
    await this.access.assignDefaultRoles(user.id);
    return this.buildResult(user);
  }

  async login(command: LoginCommand): Promise<AuthResult> {
    const identifier = (command.identifier || command.email || command.username || '').trim();
    if (!identifier) {
      throw new InvalidCredentialsException('Username or email is required');
    }
    const user = await this.users.findByIdentifier(identifier);
    if (!user?.passwordHash) {
      throw new InvalidCredentialsException();
    }
    this.ensureAccountActive(user);

    const valid = await this.hasher.compare(command.password, user.passwordHash);
    if (!valid) {
      throw new InvalidCredentialsException();
    }

    return this.buildResult(user);
  }

  async loginWithGoogle(command: GoogleLoginCommand): Promise<GoogleAuthResult> {
    const existingUser = await this.users.findByEmail(command.email.toLowerCase());
    if (!existingUser) {
      const registerToken = await this.tokens.signRegisterToken({
        email: command.email.toLowerCase(),
        displayName: command.displayName,
        providerUserId: command.providerUserId,
      });
      return { type: 'register', registerToken };
    }
    this.ensureAccountActive(existingUser);

    const user = await this.users.upsertGoogleUser({
      email: command.email.toLowerCase(),
      displayName: command.displayName,
      providerUserId: command.providerUserId,
    });
    const result = await this.buildResult(user);
    return { type: 'success', ...result };
  }

  async registerWithGoogle(command: { registerToken: string; termsAgreed: boolean }): Promise<AuthResult> {
    if (!command.termsAgreed) {
      throw new TermsNotAcceptedException();
    }
    const profile = await this.tokens.verifyRegisterToken(command.registerToken);
    const user = await this.users.upsertGoogleUser({
      email: profile.email.toLowerCase(),
      displayName: profile.displayName,
      providerUserId: profile.providerUserId,
    });
    await this.access.assignDefaultRoles(user.id);
    return this.buildResult(user);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    let payload;
    try {
      payload = await this.tokens.verifyRefreshToken(refreshToken);
    } catch {
      throw new InvalidCredentialsException('Invalid refresh token');
    }
    if (!payload.jti) {
      throw new InvalidCredentialsException('Invalid refresh token');
    }
    const existingSession = await this.refreshSessions.findActiveByHash(this.hashSecret(refreshToken));
    if (!existingSession || existingSession.id !== payload.jti || existingSession.userId !== payload.sub) {
      throw new InvalidCredentialsException('Invalid refresh token');
    }
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new InvalidCredentialsException();
    }
    this.ensureAccountActive(user);
    return this.buildResult(user, existingSession.id);
  }

  async getAuthSession(userId: string): Promise<AuthResult> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new InvalidCredentialsException();
    }
    this.ensureAccountActive(user);
    return this.buildResult(user);
  }

  async updateProfile(userId: string, command: UpdateProfileCommand): Promise<AuthResult> {
    const currentUser = await this.users.findById(userId);
    if (!currentUser) {
      throw new InvalidCredentialsException();
    }

    let usernameToUpdate: string | null | undefined = undefined;
    if (command.username !== undefined) {
      const normalized = command.username?.trim().toLowerCase() || null;
      if (normalized && normalized !== currentUser.username) {
        const existing = await this.users.findByUsername(normalized);
        if (existing && existing.id !== userId) {
          throw new DomainException('Username is already taken', 'DUPLICATE_USERNAME', 409);
        }
      }
      usernameToUpdate = normalized;
    }

    const user = await this.users.updateProfile(userId, {
      displayName: this.normalizeDisplayName(command.displayName),
      ...(usernameToUpdate !== undefined ? { username: usernameToUpdate } : {}),
    });
    if (!user) {
      throw new InvalidCredentialsException();
    }
    return this.buildResult(user);
  }

  async changePassword(userId: string, command: ChangePasswordCommand): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new InvalidCredentialsException();
    if (user.passwordHash) {
      const valid = await this.hasher.compare(command.currentPassword, user.passwordHash);
      if (!valid) throw new InvalidCredentialsException('Current password is incorrect');
    }
    const passwordHash = await this.hasher.hash(command.newPassword);
    await this.users.updatePassword(userId, passwordHash);
    await this.refreshSessions.revokeUserSessions(userId);
  }

  async exportData(userId: string): Promise<unknown> {
    const data = await this.users.exportData(userId);
    if (!data) throw new EntityNotFoundException('User', userId);
    return data;
  }

  async deleteAccount(userId: string, password?: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new EntityNotFoundException('User', userId);
    if (user.passwordHash) {
      const valid = password ? await this.hasher.compare(password, user.passwordHash) : false;
      if (!valid) throw new InvalidCredentialsException('Password is required to delete this account');
    }
    const runAt = new Date();
    runAt.setDate(runAt.getDate() + DELETION_CONSTANTS.accountDeletionGraceDays);
    const scheduled = await this.users.scheduleDeletion(userId, runAt);
    if (!scheduled) throw new EntityNotFoundException('User', userId);
    await this.refreshSessions.revokeUserSessions(userId);
    await this.queue.enqueueScheduledJob(scheduled.jobId).catch(() => undefined);
  }

  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    let payload;
    try {
      payload = await this.tokens.verifyRefreshToken(refreshToken);
    } catch {
      return;
    }
    if (payload.jti) await this.refreshSessions.revokeById(payload.jti);
  }

  async createOAuthHandoff(result: AuthResult | { registerToken: string }): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + OAUTH_HANDOFF_TTL_MS);
    const payload =
      'registerToken' in result
        ? { type: 'register' as const, registerToken: result.registerToken }
        : { type: 'success' as const, accessToken: result.accessToken, refreshToken: result.refreshToken };
    await this.oauthHandoffs.create({
      id: randomUUID(),
      codeHash: this.hashSecret(code),
      userId: 'user' in result ? result.user.id : null,
      payload,
      expiresAt,
    });
    return code;
  }

  async exchangeOAuthHandoff(code: string): Promise<AuthResult | { registerToken: string }> {
    const handoff = await this.oauthHandoffs.consume(this.hashSecret(code));
    if (!handoff) throw new InvalidCredentialsException('Invalid OAuth handoff code');
    if (handoff.payload.type === 'register' && handoff.payload.registerToken) {
      return { registerToken: handoff.payload.registerToken };
    }
    if (handoff.payload.type !== 'success' || !handoff.payload.accessToken || !handoff.payload.refreshToken) {
      throw new InvalidCredentialsException('Invalid OAuth handoff code');
    }
    const payload = await this.tokens.verifyRefreshToken(handoff.payload.refreshToken);
    if (!payload.jti) throw new InvalidCredentialsException('Invalid refresh token');
    const user = await this.users.findById(payload.sub);
    if (!user) throw new InvalidCredentialsException();
    this.ensureAccountActive(user);
    return {
      ...(await this.sessionUser(user)),
      accessToken: handoff.payload.accessToken,
      refreshToken: handoff.payload.refreshToken,
    };
  }

  private async sessionUser(user: {
    id: string;
    email?: string | null;
    username?: string | null;
    displayName?: string | null;
  }) {
    const access = await this.access.getUserAccess(user.id);
    return {
      user: { id: user.id, email: user.email, username: user.username, displayName: user.displayName, ...access },
    };
  }

  private normalizeDisplayName(displayName?: string | null): string | null {
    const trimmed = displayName?.trim();
    return trimmed ? trimmed : null;
  }

  private async buildResult(
    user: { id: string; email?: string | null; username?: string | null; displayName?: string | null },
    previousRefreshSessionId?: string,
  ): Promise<AuthResult> {
    const refreshSessionId = randomUUID();
    const tokenEmail = user.email || user.username || user.id;
    const refreshToken = await this.tokens.signRefreshToken(user.id, tokenEmail, refreshSessionId);
    const refreshSession = {
      id: refreshSessionId,
      userId: user.id,
      tokenHash: this.hashSecret(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    };
    if (previousRefreshSessionId) {
      await this.refreshSessions.rotate(previousRefreshSessionId, refreshSession);
    } else {
      await this.refreshSessions.create(refreshSession);
    }
    return {
      ...(await this.sessionUser(user)),
      accessToken: await this.tokens.signAccessToken(user.id, tokenEmail),
      refreshToken,
    };
  }

  private ensureAccountActive(user: {
    deletionRequestedAt?: Date | null;
    deletedAt?: Date | null;
    bannedAt?: Date | null;
  }): void {
    if (user.bannedAt) {
      throw new InvalidCredentialsException('Account is banned');
    }
    if (user.deletedAt || user.deletionRequestedAt) {
      throw new InvalidCredentialsException('Account deletion is pending');
    }
  }

  private hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }
}
