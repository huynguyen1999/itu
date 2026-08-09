import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AUTH_CONSTANTS } from '@core/application/constants/app.constants';
import { UsageService } from '@core/application/use-cases/usage.service';

@Injectable()
export class BrowserExtensionDsnGuard implements CanActivate {
  constructor(private readonly usage: UsageService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization;
    const key = header?.startsWith(AUTH_CONSTANTS.dsnPrefix) ? header.slice(AUTH_CONSTANTS.dsnPrefix.length) : null;
    if (!key) throw new UnauthorizedException();
    const credential = await this.usage.authenticateBrowserExtensionDsn(key);
    if (!credential) throw new UnauthorizedException();
    request.browserExtension = credential;
    return true;
  }
}
