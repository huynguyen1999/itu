import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncWebSocketClient } from './syncWebSocketClient';

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}

describe('SyncWebSocketClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reconnects with a refreshed token when the old socket closes unauthorized', () => {
    const client = new SyncWebSocketClient();
    client.connect('old-token', 'device-1', 'client-1');
    const oldSocket = MockWebSocket.instances[0];
    oldSocket.readyState = MockWebSocket.OPEN;

    client.connect('new-token', 'device-1', 'client-1');
    oldSocket.readyState = MockWebSocket.CLOSED;
    oldSocket.onclose?.({ code: 4003 });
    vi.advanceTimersByTime(3000);

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[1].url).toContain('token=new-token');
  });

  it('does not retry an unchanged unauthorized token', () => {
    const client = new SyncWebSocketClient();
    client.connect('expired-token', 'device-1', 'client-1');
    const socket = MockWebSocket.instances[0];
    socket.readyState = MockWebSocket.CLOSED;
    socket.onclose?.({ code: 4003 });
    vi.advanceTimersByTime(3000);

    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
