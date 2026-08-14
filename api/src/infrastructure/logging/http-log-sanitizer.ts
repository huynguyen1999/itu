import type { IncomingHttpHeaders, IncomingMessage, OutgoingHttpHeader } from 'node:http';

const DEFAULT_BODY_LOG_LIMIT_BYTES = 512;
const MAX_RESPONSE_SUMMARY_KEYS = 20;

const SENSITIVE_QUERY_PARAMS = new Set([
  'access_token',
  'accessToken',
  'authToken',
  'client_secret',
  'code',
  'id_token',
  'password',
  'refresh_token',
  'refreshToken',
  'token',
  'url',
]);

const SENSITIVE_BODY_KEYS = new Set([
  'access_token',
  'accessToken',
  'authorization',
  'authToken',
  'client_secret',
  'code',
  'cookie',
  'dsnKey',
  'id_token',
  'newPassword',
  'oldPassword',
  'password',
  'passwordHash',
  'refresh_token',
  'refreshToken',
  'set-cookie',
  'token',
  'url',
]);

export function shouldLogHttpBodies(): boolean {
  return (process.env.LOG_LEVEL ?? 'debug').trim().toLowerCase() === 'debug';
}

function httpBodyLogLimitBytes(): number {
  const parsed = Number(process.env.LOG_HTTP_BODY_LIMIT_BYTES ?? DEFAULT_BODY_LOG_LIMIT_BYTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BODY_LOG_LIMIT_BYTES;
}

export function resolveRequestUrl(req: IncomingMessage): string {
  const requestWithOriginalUrl = req as IncomingMessage & { originalUrl?: unknown };
  const requestWithRaw = req as IncomingMessage & { raw?: { url?: unknown } };
  const originalUrl = requestWithOriginalUrl.originalUrl;
  if (typeof originalUrl === 'string' && originalUrl.trim()) return originalUrl;

  const rawUrl = requestWithRaw.raw?.url;
  if (typeof rawUrl === 'string' && rawUrl.trim()) return rawUrl;

  return req.url ?? '/';
}

export function sanitizeHttpUrl(value: string): string {
  const url = new URL(value, 'http://localhost');
  for (const key of [...url.searchParams.keys()]) {
    if (SENSITIVE_QUERY_PARAMS.has(key)) url.searchParams.set(key, '[REDACTED]');
  }
  return `${url.pathname}${url.search}`;
}

export function sanitizeHeaderUrl(value: string | string[] | undefined): string | undefined {
  const header = headerValue(value);
  if (!header) return undefined;
  try {
    return sanitizeHttpUrl(header);
  } catch {
    return '[unparseable]';
  }
}

export function headerValue(value: OutgoingHttpHeader | undefined): string | undefined {
  if (Array.isArray(value)) return value.join(', ');
  return value === undefined ? undefined : String(value);
}

export function requestBodyLogValue(req: IncomingMessage): unknown {
  const body = (req as IncomingMessage & { body?: unknown }).body;
  if (body === undefined || body === null) return undefined;
  if (!isLoggableContentType(headerValue(req.headers['content-type']))) return '[omitted: non-json body]';
  return sanitizeAndLimit(body);
}

export function responseBodyLogMeta(
  body: unknown,
  contentType: OutgoingHttpHeader | undefined,
): { responseBody?: unknown } {
  if (body === undefined || body === null) return {};
  if (!isLoggableContentType(headerValue(contentType))) return { responseBody: '[omitted: non-json body]' };

  if (typeof body === 'string') {
    try {
      return { responseBody: summarizeResponseBody(JSON.parse(body)) };
    } catch {
      return { responseBody: sanitizeAndLimit(body) };
    }
  }

  return { responseBody: summarizeResponseBody(body) };
}

export function requestOrigin(headers: IncomingHttpHeaders): string | undefined {
  return headerValue(headers.origin);
}

function isLoggableContentType(contentType: string | undefined): boolean {
  if (!contentType) return true;
  return contentType.includes('application/json') || contentType.includes('+json') || contentType.includes('text/');
}

function sanitizeAndLimit(value: unknown): string {
  let parsedValue = value;
  if (typeof value === 'string') {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      // Keep as raw string if not valid JSON
    }
  }

  const sanitized = redactSensitiveValues(parsedValue);
  const serialized = typeof sanitized === 'string' ? sanitized : JSON.stringify(sanitized);
  const limit = httpBodyLogLimitBytes();
  if (Buffer.byteLength(serialized) <= limit) {
    return serialized;
  }

  return `${serialized.slice(0, limit)}...[truncated]`;
}

function summarizeResponseBody(value: unknown): unknown {
  if (Array.isArray(value)) {
    return { type: 'array', itemCount: value.length };
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    return {
      type: 'object',
      keys: keys.slice(0, MAX_RESPONSE_SUMMARY_KEYS),
      ...(keys.length > MAX_RESPONSE_SUMMARY_KEYS ? { omittedKeyCount: keys.length - MAX_RESPONSE_SUMMARY_KEYS } : {}),
    };
  }

  return sanitizeAndLimit(value);
}

function redactSensitiveValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSensitiveValues(item));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_BODY_KEYS.has(key) ? '[REDACTED]' : redactSensitiveValues(item),
    ]),
  );
}
