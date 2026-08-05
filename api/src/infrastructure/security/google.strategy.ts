import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AUTH_ERRORS, CONFIG_KEYS, DEFAULT_URLS, GOOGLE_OAUTH } from '@core/application/constants/app.constants';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    const clientID = config.get<string>(CONFIG_KEYS.googleClientId)?.trim();
    const clientSecret = config.get<string>(CONFIG_KEYS.googleClientSecret)?.trim();

    super({
      clientID: clientID || GOOGLE_OAUTH.disabledClientId,
      clientSecret: clientSecret || GOOGLE_OAUTH.disabledClientSecret,
      callbackURL: config.get<string>(
        CONFIG_KEYS.googleCallbackUrl,
        `${DEFAULT_URLS.apiOrigin}${GOOGLE_OAUTH.callbackPath}`,
      ),
      scope: [...GOOGLE_OAUTH.strategyScope],
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile, done: VerifyCallback) {
    const email = profile.emails?.[0]?.value;
    if (!email) return done(new Error(AUTH_ERRORS.googleProfileMissingEmail));
    done(null, {
      email,
      displayName: profile.displayName,
      providerUserId: profile.id,
    });
  }
}
