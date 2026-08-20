import type { GoogleLoginCommand } from '@core/application/ports/in/auth-use-case.port';

export const GOOGLE_OAUTH_PORT = Symbol('GOOGLE_OAUTH_PORT');

export interface GoogleOAuthPort {
  authorizationUrl(): string;
  fetchProfile(code: string): Promise<GoogleLoginCommand>;
}
