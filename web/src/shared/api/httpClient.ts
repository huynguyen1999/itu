import { clearStoredSession, saveSession } from './authStorage';
import type { AuthSession } from './types';

export const API_BASE_URL = apiBaseUrl();
const API_REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 30_000);

const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/oauth/exchange'];

export class HttpClient {
  private token: string | null = null;
  private refreshPromise: Promise<AuthSession> | null = null;
  private readonly tokenListeners = new Set<(token: string | null) => void>();

  setToken(token: string | null) {
    if (this.token === token) return;
    this.token = token;
    this.tokenListeners.forEach((listener) => listener(token));
  }

  getToken(): string | null {
    return this.token;
  }

  subscribeToken(listener: (token: string | null) => void): () => void {
    this.tokenListeners.add(listener);
    return () => this.tokenListeners.delete(listener);
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchWithAuth(path, init);
    if (!response.ok) throw await requestError(response);
    return parseResponse<T>(response);
  }

  async stream(path: string, init: RequestInit = {}): Promise<ReadableStream<Uint8Array>> {
    const response = await this.fetchWithAuth(path, init, { timeout: false });
    if (!response.ok) throw await requestError(response);
    if (!response.body) throw new Error('No response body');
    return response.body;
  }

  async objectUrl(url: string): Promise<string> {
    const path = toApiMediaPath(url);
    if (!path) throw new Error('URL is not an API media URL');

    const response = await this.fetchWithAuth(path, {});
    if (!response.ok) throw await requestError(response);
    return URL.createObjectURL(await response.blob());
  }

  async refresh() {
    this.refreshPromise ??= this.fetchRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async fetchRefresh() {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) throw await requestError(response, 'Refresh failed');
    return response.json() as Promise<AuthSession>;
  }

  private async fetchWithAuth(path: string, init: RequestInit, options: { timeout?: boolean } = {}) {
    const headers = requestHeaders(init, this.token);
    let response = await fetch(`${API_BASE_URL}${path}`, withRequestDefaults(init, headers, options));

    if (response.status !== 401 || PUBLIC_AUTH_PATHS.includes(path)) {
      return response;
    }

    try {
      const session = await this.refresh();
      this.setToken(session.accessToken);
      saveSession(session);
      headers.set('Authorization', `Bearer ${session.accessToken}`);
      response = await fetch(`${API_BASE_URL}${path}`, withRequestDefaults(init, headers, options));
      return response;
    } catch {
      this.clearExpiredSession('Session expired');
    }
  }

  private clearExpiredSession(message: string): never {
    this.setToken(null);
    clearStoredSession();
    if (window.location.pathname !== '/auth') {
      window.location.assign('/auth');
    }
    throw new Error(message);
  }
}

function apiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  if (typeof window === 'undefined') return 'http://localhost:3000';

  return `${window.location.protocol}//${window.location.hostname}:3000`;
}

function withRequestDefaults(init: RequestInit, headers: Headers, options: { timeout?: boolean }): RequestInit {
  const timeoutSignal =
    options.timeout !== false && Number.isFinite(API_REQUEST_TIMEOUT_MS) && API_REQUEST_TIMEOUT_MS > 0
      ? AbortSignal.timeout(API_REQUEST_TIMEOUT_MS)
      : undefined;
  const signal =
    init.signal && timeoutSignal ? AbortSignal.any([init.signal, timeoutSignal]) : init.signal || timeoutSignal;
  return {
    ...init,
    credentials: 'include',
    headers,
    keepalive: init.keepalive ?? canUseKeepalive(init),
    signal,
  };
}

function canUseKeepalive(init: RequestInit): boolean {
  return !init.body || typeof init.body === 'string';
}

export function isApiMediaUrl(url: string): boolean {
  return toApiMediaPath(url) !== null;
}

function toApiMediaPath(url: string): string | null {
  if (url.startsWith('/media/')) return url;
  if (url.startsWith('/')) return null;

  try {
    const parsed = new URL(url);
    const api = new URL(API_BASE_URL);
    if (parsed.origin !== api.origin || !parsed.pathname.startsWith('/media/')) return null;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

function requestHeaders(init: RequestInit, token: string | null): Headers {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

async function requestError(response: Response, fallback = 'Request failed'): Promise<Error> {
  const body = (await response.json().catch(() => ({ message: response.statusText }))) as {
    message?: string;
    code?: string;
    details?: Record<string, unknown>;
  };
  return new ApiRequestError(
    body.message ?? fallback,
    response.status,
    retryAfterMs(response.headers.get('Retry-After')),
    body.code,
    body.details,
  );
}

function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text) return undefined as T;

  return JSON.parse(text) as T;
}
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterMs?: number,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}
