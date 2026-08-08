import {
  changePassword as changePasswordApi,
  getAuthSession,
  login as loginApi,
  logout as logoutApi,
  register as registerApi,
  updateProfile as updateProfileApi,
} from '../../generated/api/auth/auth';
import { API_BASE_URL } from './httpClient';
import type { ApiClientContext } from './apiContext';
import type { AuthSession } from './types';

export function createAuthApi(ctx: ApiClientContext) {
  return {
    async login(identifierOrEmail: string, password: string) {
      const res = await loginApi({ identifier: identifierOrEmail, password } as any);
      return res as unknown as AuthSession;
    },
    async logout() {
      const res = await logoutApi();
      return res as unknown as { ok: true };
    },
    async register(
      data: { email?: string; username?: string; password: string; displayName?: string } | string,
      password?: string,
      displayName?: string,
    ) {
      const payload = typeof data === 'string' ? { email: data, password: password!, displayName } : data;
      const res = await registerApi(payload as any);
      return res as unknown as AuthSession;
    },
    async me() {
      const res = await getAuthSession();
      return res as unknown as AuthSession;
    },
    async updateProfile(data: { displayName?: string | null; username?: string | null }) {
      const res = await updateProfileApi(data as any);
      return res as unknown as AuthSession;
    },
    async changePassword(data: { currentPassword: string; newPassword: string }) {
      const res = await changePasswordApi(data as any);
      return res as unknown as { ok: true };
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
