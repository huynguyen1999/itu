import type { IncomingMessage } from 'node:http';

const capturedResponseBodies = new WeakMap<IncomingMessage, unknown>();

export function captureResponseBody(req: IncomingMessage, payload: unknown): void {
  capturedResponseBodies.set(req, payload);
}

export function takeCapturedResponseBody(req: IncomingMessage): unknown {
  const payload = capturedResponseBodies.get(req);
  capturedResponseBodies.delete(req);
  return payload;
}
