export const SSE_CONSTANTS = {
  dataPrefix: 'data: ',
  errorEvent: 'event: error',
} as const;

export interface ParsedSseLine<T = Record<string, unknown>> {
  isData: boolean;
  data: T | null;
  error: string | null;
  rawJson: string | null;
}

export function parseSseEventLine<T = Record<string, unknown>>(line: string): ParsedSseLine<T> {
  const trimmed = line.trim();
  if (!trimmed.startsWith(SSE_CONSTANTS.dataPrefix)) {
    return { isData: false, data: null, error: null, rawJson: null };
  }

  const rawJson = trimmed.slice(SSE_CONSTANTS.dataPrefix.length);
  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    const error = typeof parsed.error === 'string' ? parsed.error : null;
    return {
      isData: true,
      data: parsed as T,
      error,
      rawJson,
    };
  } catch (err) {
    if (trimmed.includes(SSE_CONSTANTS.errorEvent)) {
      throw err;
    }
    return { isData: true, data: null, error: null, rawJson };
  }
}
