import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import type { IRateLimitRepository } from '@core/application/ports/out/repositories.port';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedRequest } from '../types/authenticated-request';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;

@Injectable()
export class AiRateLimitGuard implements CanActivate {
  constructor(@Inject(TOKENS.RATE_LIMIT_REPOSITORY) private readonly rateLimits: IRateLimitRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & FastifyRequest>();
    const key = request.user?.sub ?? request.ip ?? 'anonymous';
    const result = await this.rateLimits.consume(`ai:${key}`, WINDOW_MS, MAX_REQUESTS);
    if (!result.allowed) {
      throw new HttpException('Too many AI requests. Try again in a minute.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
