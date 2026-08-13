import { describe, expect, it } from 'vitest';
import { parseSseEventLine } from './sse';

describe('parseSseEventLine', () => {
  it('parses data from an SSE event block', () => {
    expect(parseSseEventLine<{ chunk: string }>('data: {"chunk":"hello"}')).toEqual({
      isData: true,
      data: { chunk: 'hello' },
      error: null,
      code: null,
      rawJson: '{"chunk":"hello"}',
    });
  });

  it('parses errors from an SSE error event block', () => {
    expect(parseSseEventLine('event: error\ndata: {"error":"Provider unavailable"}')).toEqual({
      isData: true,
      data: { error: 'Provider unavailable' },
      error: 'Provider unavailable',
      code: null,
      rawJson: '{"error":"Provider unavailable"}',
    });
  });
});
