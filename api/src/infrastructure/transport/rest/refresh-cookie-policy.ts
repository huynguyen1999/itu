import { AUTH_CONSTANTS } from '@core/application/constants/app.constants';

export interface RefreshCookiePolicy {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax' | 'none';
  path: '/';
  maxAge?: number;
}

export function refreshCookiePolicy(webOrigin: string | undefined, includeMaxAge: boolean): RefreshCookiePolicy {
  const origin = firstOrigin(webOrigin);
  const secure = origin?.protocol === 'https:';
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path: '/',
    ...(includeMaxAge ? { maxAge: AUTH_CONSTANTS.refreshTokenTtlMs / 1000 } : {}),
  };
}

function firstOrigin(value: string | undefined): URL | null {
  const candidate = value?.split(',')[0]?.trim();
  if (!candidate) return null;
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}
