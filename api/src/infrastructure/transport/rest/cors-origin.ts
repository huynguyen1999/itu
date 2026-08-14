import { CONFIG_KEYS, DEFAULT_URLS } from '@core/application/constants/app.constants';

const DEFAULT_ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', 'homelab.tailscale', 'homelab.org']);

function isAllowedCorsOrigin(origin?: string): boolean {
  if (!origin) return true;
  if (configuredOrigins().has(origin)) return true;

  try {
    const parsed = new URL(origin);
    return DEFAULT_ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function corsOrigin(origin: string | undefined, callback: (error: Error | null, allow: boolean) => void) {
  callback(null, isAllowedCorsOrigin(origin));
}

export function allowedResponseOrigin(origin?: string): string {
  return origin && isAllowedCorsOrigin(origin) ? origin : DEFAULT_URLS.webOrigin;
}

function configuredOrigins(): Set<string> {
  return new Set(
    (process.env[CONFIG_KEYS.webOrigin] ?? DEFAULT_URLS.webOrigin)
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}
