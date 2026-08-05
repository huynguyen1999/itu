import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AUTH_CONSTANTS, CONFIG_KEYS } from '@core/application/constants/app.constants';
import { TOKENS } from '@core/application/constants/tokens';
import type { IUserRepository } from '@core/application/ports/out/repositories.port';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(TOKENS.USER_REPOSITORY) private readonly users: IUserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization;
    const token = header?.startsWith(AUTH_CONSTANTS.bearerPrefix)
      ? header.slice(AUTH_CONSTANTS.bearerPrefix.length)
      : null;
    if (!token) throw new UnauthorizedException();

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.getOrThrow<string>(CONFIG_KEYS.jwtAccessSecret),
      });
      const user = await this.users.findById(payload.sub);
      if (!user || user.deletedAt || user.deletionRequestedAt || user.bannedAt) throw new UnauthorizedException();
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
