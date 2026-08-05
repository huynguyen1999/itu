import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AUTH_CONSTANTS, CONFIG_KEYS } from '@core/application/constants/app.constants';
import { ITokenService } from '@core/application/ports/out/services.port';
import type { VerifiedTokenPayload } from '@core/application/ports/out/service-types.port';

@Injectable()
export class JwtTokenService implements ITokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  signAccessToken(userId: string, email: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, email },
      { secret: this.config.getOrThrow<string>(CONFIG_KEYS.jwtAccessSecret), expiresIn: AUTH_CONSTANTS.accessTokenTtl },
    );
  }

  signRefreshToken(userId: string, email: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, email, jti: sessionId },
      {
        secret: this.config.getOrThrow<string>(CONFIG_KEYS.jwtRefreshSecret),
        expiresIn: AUTH_CONSTANTS.refreshTokenTtl,
      },
    );
  }

  verifyRefreshToken(token: string): Promise<VerifiedTokenPayload> {
    return this.jwt.verifyAsync(token, {
      secret: this.config.getOrThrow<string>(CONFIG_KEYS.jwtRefreshSecret),
    });
  }

  signRegisterToken(profile: { email: string; displayName?: string; providerUserId: string }): Promise<string> {
    return this.jwt.signAsync(
      { type: 'google_register', ...profile },
      {
        secret: this.config.getOrThrow<string>(CONFIG_KEYS.jwtAccessSecret),
        expiresIn: '15m',
      },
    );
  }

  async verifyRegisterToken(token: string): Promise<{ email: string; displayName?: string; providerUserId: string }> {
    const payload = await this.jwt.verifyAsync(token, {
      secret: this.config.getOrThrow<string>(CONFIG_KEYS.jwtAccessSecret),
    });
    if (payload.type !== 'google_register') {
      throw new Error('Invalid token type');
    }
    return {
      email: payload.email,
      displayName: payload.displayName,
      providerUserId: payload.providerUserId,
    };
  }
}
