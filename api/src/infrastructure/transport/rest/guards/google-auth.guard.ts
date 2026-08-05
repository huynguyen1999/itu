import { ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { AUTH_ERRORS, CONFIG_KEYS } from '@core/application/constants/app.constants';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const clientID = this.config.get<string>(CONFIG_KEYS.googleClientId)?.trim();
    const clientSecret = this.config.get<string>(CONFIG_KEYS.googleClientSecret)?.trim();

    if (!clientID || !clientSecret) {
      throw new ServiceUnavailableException(AUTH_ERRORS.googleNotConfigured);
    }

    return super.canActivate(context);
  }

  getResponse(context: ExecutionContext) {
    const response = context.switchToHttp().getResponse();
    return response.raw ?? response;
  }
}
