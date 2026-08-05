import { API_BASE_URL } from '../api/httpClient';

export interface SyncInvalidationMessage {
  type: 'SYNC_AVAILABLE';
  cursor: string;
  originDeviceId: string;
  originClientInstanceId: string;
}

export type SyncInvalidationListener = (message: SyncInvalidationMessage) => void;
export type SyncConnectionListener = () => void;

export class SyncWebSocketClient {
  private socket: WebSocket | null = null;
  private readonly listeners: Set<SyncInvalidationListener> = new Set();
  private readonly connectionListeners: Set<SyncConnectionListener> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private token: string | null = null;
  private deviceId: string | null = null;
  private clientInstanceId: string | null = null;
  private isExplicitlyClosed = false;

  public isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  public connect(token: string, deviceId: string, clientInstanceId: string) {
    this.token = token;
    this.deviceId = deviceId;
    this.clientInstanceId = clientInstanceId;
    this.isExplicitlyClosed = false;

    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) {
      return;
    }

    const wsProtocol = API_BASE_URL.startsWith('https') ? 'wss' : 'ws';
    const host = API_BASE_URL.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProtocol}://${host}/ws/sync?token=${encodeURIComponent(token)}&deviceId=${encodeURIComponent(deviceId)}&clientInstanceId=${encodeURIComponent(clientInstanceId)}`;

    try {
      const connectionToken = token;
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.connectionListeners.forEach((listener) => listener());
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as SyncInvalidationMessage;
          if (data && data.type === 'SYNC_AVAILABLE') {
            this.listeners.forEach((listener) => listener(data));
          }
        } catch {
          // Ignore invalid JSON payload
        }
      };

      this.socket.onclose = (event) => {
        const hasRefreshedToken = event.code === 4003 && this.token !== connectionToken;
        const isSessionEnd = event.code === 4001;
        const isStaleTokenWithoutRefresh = event.code === 4003 && !hasRefreshedToken;
        const shouldAutoReconnect = !this.isExplicitlyClosed && !isSessionEnd && !isStaleTokenWithoutRefresh;
        if (shouldAutoReconnect) {
          this.scheduleReconnect();
        }
      };

      this.socket.onerror = () => {
        this.socket?.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  public disconnect() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  public subscribe(listener: SyncInvalidationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeConnected(listener: SyncConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      const { token, deviceId, clientInstanceId } = this;
      if (token && deviceId && clientInstanceId && !this.isExplicitlyClosed) {
        this.connect(token, deviceId, clientInstanceId);
      }
    }, 3000);
  }
}
