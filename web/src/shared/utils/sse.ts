const SSE_CONSTANTS = {
  dataPrefix: 'data: ',
  errorEvent: 'event: error',
} as const;

export interface ParsedSseLine<T = Record<string, unknown>> {
  isData: boolean;
  data: T | null;
  error: string | null;
  code: string | null;
  rawJson: string | null;
}

export function parseSseEventLine<T = Record<string, unknown>>(line: string): ParsedSseLine<T> {
  const lines = line.split(/\r?\n/).map((entry) => entry.trim());
  const dataLine = lines.find((entry) => entry.startsWith(SSE_CONSTANTS.dataPrefix));
  if (!dataLine) {
    return { isData: false, data: null, error: null, code: null, rawJson: null };
  }

  const rawJson = dataLine.slice(SSE_CONSTANTS.dataPrefix.length);
  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    const error = typeof parsed.error === 'string' ? parsed.error : null;
    const code = typeof parsed.code === 'string' ? parsed.code : null;
    return {
      isData: true,
      data: parsed as T,
      error,
      code,
      rawJson,
    };
  } catch (err) {
    if (lines.includes(SSE_CONSTANTS.errorEvent)) {
      throw err;
    }
    return { isData: true, data: null, error: null, code: null, rawJson };
  }
}
