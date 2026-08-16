/**
 * api-client.ts
 *
 * Direct HTTP client for TalkFirst campus endpoints.
 * Handles automatic token injection, validation, and 401 Unauthorized refresh retries.
 */

import {
  API_ROUTES,
  DEFAULT_EXPIRY_SAFETY_BUFFER_SECONDS,
  DEFAULT_TALKFIRST_BASE_URL,
  DEFAULT_USER_AGENT,
  WEB_ROUTES,
} from './constants.ts';
import { isTokenExpired, loadTokens, saveTokens } from './token-manager.ts';
import type { ApiClientOptions, WeekScheduleData } from './types.ts';

export class TalkFirstApiError extends Error {
  public status?: number;
  public payload?: unknown;

  constructor(message: string, status?: number, payload?: unknown) {
    super(message);
    this.name = 'TalkFirstApiError';
    this.status = status;
    this.payload = payload;
  }
}

export class TalkFirstApiClient {
  public baseUrl: string;
  public accessToken?: string;
  public refreshToken?: string;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_TALKFIRST_BASE_URL;
    this.accessToken = options.accessToken;
    this.refreshToken = options.refreshToken;
    this.hydrateTokensFromStorage();
  }

  public hydrateTokensFromStorage(): void {
    const saved = loadTokens();
    if (!saved) {
      return;
    }

    this.accessToken = saved.accessToken;
    this.refreshToken = saved.refreshToken;
  }

  /**
   * Refreshes the active authentication session using the refresh token.
   */
  async refreshSession(refreshTokenOverride?: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenToUse = refreshTokenOverride || this.refreshToken;
    if (!tokenToUse) {
      throw new TalkFirstApiError('[TalkFirstApiClient] No refresh token available to refresh session.');
    }

    const url = `${this.baseUrl}${API_ROUTES.AUTH_REFRESH}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'User-Agent': DEFAULT_USER_AGENT,
        Origin: this.baseUrl,
        Referer: `${this.baseUrl}${WEB_ROUTES.MY_SCHEDULE}`,
        Cookie: `refreshToken=${tokenToUse}; rememberMe=1`,
      },
      body: JSON.stringify({ refreshToken: tokenToUse }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new TalkFirstApiError(`Token refresh failed (${response.status}): ${errorText}`, response.status);
    }

    const data = (await response.json()) as { accessToken: string; refreshToken: string };
    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken;

    saveTokens({ accessToken: this.accessToken, refreshToken: this.refreshToken });
    return { accessToken: this.accessToken, refreshToken: this.refreshToken };
  }

  /**
   * Ensures the access token is valid, refreshing it if expired or nearing expiration.
   */
  async ensureValidAccessToken(): Promise<string> {
    this.hydrateTokensFromStorage();

    if (!this.accessToken) {
      if (this.refreshToken) {
        console.log('[TalkFirstApiClient] No access token found. Refreshing session...');
        const newTokens = await this.refreshSession();
        return newTokens.accessToken;
      }
      throw new TalkFirstApiError('[TalkFirstApiClient] Unauthenticated. Please provide login tokens.');
    }

    if (isTokenExpired(this.accessToken, DEFAULT_EXPIRY_SAFETY_BUFFER_SECONDS)) {
      console.log('[TalkFirstApiClient] Access token expired or expiring soon. Refreshing...');
      const newTokens = await this.refreshSession();
      return newTokens.accessToken;
    }

    return this.accessToken;
  }

  /**
   * Performs an authenticated HTTP request with automatic token validation and 401 retry.
   */
  async sendRequest<T = unknown>(endpointPath: string, options: RequestInit = {}): Promise<T> {
    await this.ensureValidAccessToken();

    const fullUrl = endpointPath.startsWith('http') ? endpointPath : `${this.baseUrl}${endpointPath}`;

    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': DEFAULT_USER_AGENT,
      Authorization: `Bearer ${this.accessToken}`,
      Cookie: `rememberMe=1; accessToken=${this.accessToken}; refreshToken=${this.refreshToken ?? ''}`,
      ...((options.headers as Record<string, string>) || {}),
    };

    let response = await fetch(fullUrl, { ...options, headers });

    // Automatic single-retry on 401 Unauthorized
    if (response.status === 401 && this.refreshToken) {
      console.log('[TalkFirstApiClient] 401 Unauthorized. Retrying after refreshing tokens...');
      await this.refreshSession();
      headers.Authorization = `Bearer ${this.accessToken}`;
      headers.Cookie = `rememberMe=1; accessToken=${this.accessToken}; refreshToken=${this.refreshToken ?? ''}`;
      response = await fetch(fullUrl, { ...options, headers });
    }

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const responsePayload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const errorDetail =
        typeof responsePayload === 'object' ? JSON.stringify(responsePayload) : String(responsePayload);
      throw new TalkFirstApiError(
        `HTTP ${response.status} ${response.statusText}: ${errorDetail}`,
        response.status,
        responsePayload
      );
    }

    return responsePayload as T;
  }

  /**
   * Fetches weekly class schedules from TalkFirst.
   */
  async fetchSchedule({
    date,
    weekType = 'current',
  }: {
    date: string;
    weekType?: 'current' | 'next';
  }): Promise<WeekScheduleData> {
    if (!date) {
      throw new TalkFirstApiError('[TalkFirstApiClient] A date parameter (YYYY-MM-DD) is required.');
    }
    const query = new URLSearchParams({ weekType, date }).toString();
    return await this.sendRequest<WeekScheduleData>(`${API_ROUTES.SCHEDULE_CLASSES}?${query}`, {
      method: 'GET',
    });
  }
}
