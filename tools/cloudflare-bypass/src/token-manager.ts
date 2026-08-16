/**
 * token-manager.ts
 *
 * Local JWT storage, decoding, and expiration tracking for TalkFirst student sessions.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_EXPIRY_SAFETY_BUFFER_SECONDS } from './constants.ts';
import type { AuthTokens, JwtPayload, SaveTokensInput } from './types.ts';

const currentDir = dirname(fileURLToPath(import.meta.url));
export const TOKENS_FILE = resolve(currentDir, '../.tokens.json');

/**
 * Decodes the JSON payload from a JWT without verifying the cryptographic signature.
 */
export function decodeJwt(token: string | null | undefined): JwtPayload | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Checks whether a JWT token is expired (or will expire within a safety buffer).
 */
export function isTokenExpired(
  token: string | null | undefined,
  bufferSeconds: number = DEFAULT_EXPIRY_SAFETY_BUFFER_SECONDS
): boolean {
  if (!token) {
    return true;
  }

  const payload = decodeJwt(token);
  if (!payload?.exp) {
    return true;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  return payload.exp <= nowSeconds + bufferSeconds;
}

/**
 * Loads session tokens from the local .tokens.json file.
 */
export function loadTokens(): AuthTokens | null {
  if (!existsSync(TOKENS_FILE)) {
    return null;
  }

  try {
    const content = readFileSync(TOKENS_FILE, 'utf-8');
    return JSON.parse(content) as AuthTokens;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[token-manager] Failed to read .tokens.json:', message);
    return null;
  }
}

/**
 * Saves access and refresh tokens to .tokens.json along with decoded metadata.
 */
export function saveTokens({ accessToken, refreshToken }: SaveTokensInput): AuthTokens {
  const current = loadTokens() ?? {};
  const effectiveAccessToken = accessToken || current.accessToken;
  const effectiveRefreshToken = refreshToken || current.refreshToken;

  const accessPayload = decodeJwt(effectiveAccessToken);
  const refreshPayload = decodeJwt(effectiveRefreshToken);

  const tokenData: AuthTokens = {
    accessToken: effectiveAccessToken,
    refreshToken: effectiveRefreshToken,
    savedAt: new Date().toISOString(),
    accessTokenExpiresAt: accessPayload?.exp
      ? new Date(accessPayload.exp * 1000).toISOString()
      : null,
    refreshTokenExpiresAt: refreshPayload?.exp
      ? new Date(refreshPayload.exp * 1000).toISOString()
      : null,
    user: accessPayload
      ? {
          id: accessPayload.sub,
          email: accessPayload.email,
          role: accessPayload.role,
        }
      : current.user,
  };

  writeFileSync(TOKENS_FILE, JSON.stringify(tokenData, null, 2), 'utf-8');
  return tokenData;
}
