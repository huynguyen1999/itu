import type { AuthSession } from './types';
import { safeLocalStorage } from '../browser/safeStorage';

const STORAGE_KEYS = {
  user: 'user',
} as const;

const LEGACY_TOKEN_KEYS = ['accessToken', 'refreshToken'] as const;

export function saveSession(session: AuthSession) {
  clearLegacyTokens();
  safeLocalStorage.setItem(STORAGE_KEYS.user, JSON.stringify(session.user));
}

export function clearStoredSession() {
  clearLegacyTokens();
  safeLocalStorage.removeItem(STORAGE_KEYS.user);
}

function clearLegacyTokens(): void {
  LEGACY_TOKEN_KEYS.forEach((key) => safeLocalStorage.removeItem(key));
}
