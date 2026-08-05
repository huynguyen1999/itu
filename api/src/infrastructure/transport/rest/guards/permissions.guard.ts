import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TOKENS } from '@core/application/constants/tokens';
import type { IAccessRepository } from '@core/application/ports/out/access-repository.port';
import { REQUIRED_PERMISSIONS } from '../decorators/require-permissions.decorator';
import type { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKENS.ACCESS_REPOSITORY) private readonly access: IAccessRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const effective = await this.access.getUserAccess(request.user.sub);
    if (required.every((permission) => effective.permissions.includes(permission))) return true;
    throw new ForbiddenException('You do not have the required permission');
  }
}
