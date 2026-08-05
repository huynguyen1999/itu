import type { IncomingMessage } from 'node:http';
import { captureResponseBody, takeCapturedResponseBody } from './response-body-capture';

describe('response body capture', () => {
  it('returns the pre-serialization payload once', () => {
    const request = {} as IncomingMessage;
    const payload = { cards: [{ id: 'card-1' }] };

    captureResponseBody(request, payload);

    expect(takeCapturedResponseBody(request)).toBe(payload);
    expect(takeCapturedResponseBody(request)).toBeUndefined();
  });
});
