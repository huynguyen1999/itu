import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GoogleOAuthPort } from '@core/application/ports/out/google-oauth.port';
import {
  AUTH_ERRORS,
  CONFIG_KEYS,
  CONTENT_TYPES,
  DEFAULT_URLS,
  GOOGLE_OAUTH,
  HTTP_HEADERS,
} from '@core/application/constants/app.constants';
import { DomainException } from '@core/domain/exceptions';
import { fetchWithTimeout } from '@infrastructure/http/outbound-http';

interface GoogleTokenResponse {
  access_token?: string;
}

interface GoogleProfileResponse {
  sub?: string;
  email?: string;
  name?: string;
}

@Injectable()
export class GoogleOAuthAdapter implements GoogleOAuthPort {
  constructor(private readonly config: ConfigService) {}

  authorizationUrl(): string {
    const url = new URL(GOOGLE_OAUTH.authorizationUrl);
    url.searchParams.set('client_id', this.clientId());
    url.searchParams.set('redirect_uri', this.callbackUrl());
    url.searchParams.set('response_type', GOOGLE_OAUTH.responseType);
    url.searchParams.set('scope', GOOGLE_OAUTH.scope);
    url.searchParams.set('access_type', GOOGLE_OAUTH.accessType);
    url.searchParams.set('prompt', GOOGLE_OAUTH.prompt);
    return url.toString();
  }

  async fetchProfile(code: string) {
    const tokenResponse = await fetchWithTimeout(GOOGLE_OAUTH.tokenUrl, {
      method: 'POST',
      headers: { [HTTP_HEADERS.contentType]: CONTENT_TYPES.formUrlEncoded },
      body: new URLSearchParams({
        code,
        client_id: this.clientId(),
        client_secret: this.clientSecret(),
        redirect_uri: this.callbackUrl(),
        grant_type: GOOGLE_OAUTH.grantType,
      }),
    });

    if (!tokenResponse.ok) throw new DomainException(AUTH_ERRORS.googleTokenExchangeFailed);
    const token = (await tokenResponse.json()) as GoogleTokenResponse;
    if (!token.access_token) throw new DomainException(AUTH_ERRORS.googleTokenMissingAccessToken);

    const profileResponse = await fetchWithTimeout(GOOGLE_OAUTH.userInfoUrl, {
      headers: { [HTTP_HEADERS.authorization]: `Bearer ${token.access_token}` },
    });
    if (!profileResponse.ok) throw new DomainException(AUTH_ERRORS.googleProfileRequestFailed);

    const profile = (await profileResponse.json()) as GoogleProfileResponse;
    if (!profile.sub || !profile.email) throw new DomainException(AUTH_ERRORS.googleProfileMissingRequiredFields);
    return { email: profile.email, displayName: profile.name, providerUserId: profile.sub };
  }

  private clientId(): string {
    const clientId = this.config.get<string>(CONFIG_KEYS.googleClientId)?.trim();
    if (!clientId) throw new DomainException(AUTH_ERRORS.googleNotConfigured, 'GOOGLE_NOT_CONFIGURED', 503);
    return clientId;
  }

  private clientSecret(): string {
    const clientSecret = this.config.get<string>(CONFIG_KEYS.googleClientSecret)?.trim();
    if (!clientSecret) throw new DomainException(AUTH_ERRORS.googleNotConfigured, 'GOOGLE_NOT_CONFIGURED', 503);
    return clientSecret;
  }

  private callbackUrl(): string {
    return this.config.get<string>(
      CONFIG_KEYS.googleCallbackUrl,
      `${DEFAULT_URLS.apiOrigin}${GOOGLE_OAUTH.callbackPath}`,
    );
  }
}
