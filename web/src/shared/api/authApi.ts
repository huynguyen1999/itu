import { API_BASE_URL } from './httpClient';
import type { ApiClientContext } from './apiContext';
import type { AuthSession } from './types';

export function createAuthApi(ctx: ApiClientContext) {
  return {
    async login(identifierOrEmail: string, password: string) {
      return ctx.request<AuthSession>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: identifierOrEmail, password }),
      });
    },
    async logout() {
      return ctx.request<{ ok: true }>('/auth/logout', { method: 'POST' });
    },
    async register(
      data: { email?: string; username?: string; password: string; displayName?: string } | string,
      password?: string,
      displayName?: string,
    ) {
      const payload = typeof data === 'string' ? { email: data, password: password!, displayName } : data;
      return ctx.request<AuthSession>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    async me() {
      return ctx.request<AuthSession>('/auth/me');
    },
    async updateProfile(data: { displayName?: string | null; username?: string | null }) {
      return ctx.request<AuthSession>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    async changePassword(data: { currentPassword: string; newPassword: string }) {
      return ctx.request<{ ok: true }>('/auth/password', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    exportData() {
      return ctx.request<unknown>('/auth/data-export');
    },
    deleteAccount(password?: string) {
      return ctx.request<{ ok: true }>('/auth/me', { method: 'DELETE', body: JSON.stringify({ password }) });
    },
    googleRegister(registerToken: string, termsAgreed: boolean) {
      return ctx.request<AuthSession>('/auth/google/register', {
        method: 'POST',
        body: JSON.stringify({ registerToken, termsAgreed }),
      });
    },
    oauthExchange(code: string) {
      return ctx.request<AuthSession | { registerToken: string }>('/auth/oauth/exchange', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
    },
    googleOAuthUrl() {
      return `${API_BASE_URL}/auth/google`;
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
