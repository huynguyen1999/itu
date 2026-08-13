import { AiCredentialStatus } from '@core/domain/enums';

export const DEFAULT_GEMINI_COOLDOWN_MS = 60_000;

export type GeminiErrorClassification = {
  status: AiCredentialStatus;
  retryAfterMs?: number;
};

export class GeminiProviderError extends Error {
  constructor(
    message: string,
    public readonly code = 'GEMINI_PROVIDER_ERROR',
  ) {
    super(message);
    this.name = 'GeminiProviderError';
  }
}

export function geminiNotConfiguredError(): GeminiProviderError {
  return new GeminiProviderError('Configure Gemini in Settings to use AI', 'GEMINI_NOT_CONFIGURED');
}

export function classifyGeminiError(error: unknown): GeminiErrorClassification {
  const text = errorText(error).toLowerCase();
  const status = httpStatus(error);

  if (
    text.includes('quota') ||
    text.includes('resource exhausted') ||
    text.includes('daily limit') ||
    text.includes('per day') ||
    (status === 429 && text.includes('exhaust'))
  ) {
    return { status: AiCredentialStatus.QUOTA_EXHAUSTED };
  }

  if (status === 429 || text.includes('rate limit') || text.includes('too many requests')) {
    return {
      status: AiCredentialStatus.RATE_LIMITED,
      retryAfterMs: retryAfterMs(error) ?? DEFAULT_GEMINI_COOLDOWN_MS,
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    text.includes('api key') ||
    text.includes('invalid key') ||
    text.includes('unauthenticated')
  ) {
    return { status: AiCredentialStatus.INVALID_KEY };
  }

  return { status: AiCredentialStatus.PROVIDER_ERROR };
}

export function isImageCapabilityError(error: unknown): boolean {
  const status = httpStatus(error);
  if (status === 401 || status === 403 || status === 429 || (status && status >= 500)) {
    return false;
  }

  const text = errorText(error).toLowerCase();
  return (
    text.includes('image') ||
    text.includes('vision') ||
    text.includes('multimodal') ||
    text.includes('inline data') ||
    text.includes('inlinedata')
  );
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return JSON.stringify(error) || 'Gemini request failed';
}

export function httpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const value = (error as { status?: unknown }).status;
  return typeof value === 'number' ? value : undefined;
}

function retryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;

  const candidate = error as {
    retryAfter?: unknown;
    retryAfterMs?: unknown;
    headers?: { get?: (name: string) => string | null } | Record<string, unknown>;
  };

  if (typeof candidate.retryAfterMs === 'number') return candidate.retryAfterMs;
  if (typeof candidate.retryAfter === 'number') return candidate.retryAfter * 1000;

  const headerValue =
    candidate.headers &&
    typeof candidate.headers === 'object' &&
    'get' in candidate.headers &&
    typeof candidate.headers.get === 'function'
      ? candidate.headers.get('retry-after')
      : candidate.headers && typeof candidate.headers === 'object'
        ? (candidate.headers as Record<string, unknown>)['retry-after']
        : undefined;
  if (typeof headerValue === 'string') {
    const seconds = Number(headerValue);
    if (Number.isFinite(seconds)) return seconds * 1000;
  }

  const match = errorText(error).match(/retry(?:[- ]after)?\D+(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) * 1000 : undefined;
}
