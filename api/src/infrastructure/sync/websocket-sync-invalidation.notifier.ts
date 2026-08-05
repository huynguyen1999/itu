import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { WebSocketServer, WebSocket } from 'ws';
import { CONFIG_KEYS } from '@core/application/constants/app.constants';
import { ISyncInvalidationNotifier, SyncInvalidationEvent } from '@core/application/ports/out/services.port';

@Injectable()
export class WebSocketSyncInvalidationNotifier implements ISyncInvalidationNotifier, OnModuleInit, OnModuleDestroy {
  private wss: WebSocketServer | null = null;
  private readonly connections = new Map<string, Map<string, Map<string, WebSocket>>>();
  private upgradeHandler: ((req: IncomingMessage, socket: Socket, head: Buffer) => void) | null = null;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.wss) return;
    const httpServer = this.adapterHost.httpAdapter?.getHttpServer();
    if (!httpServer) return;

    this.wss = new WebSocketServer({ noServer: true });

    this.upgradeHandler = (req: IncomingMessage, socket: Socket, head: Buffer) => {
      if (socket.destroyed || socket.writableEnded) return;
      const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
      if (url.pathname === '/ws/sync') {
        this.wss?.handleUpgrade(req, socket, head, (ws) => {
          this.wss?.emit('connection', ws, req);
        });
      }
    };

    httpServer.on('upgrade', this.upgradeHandler);

    this.wss.on('connection', async (socket: WebSocket, req: IncomingMessage) => {
      try {
        const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
        const token = url.searchParams.get('token');
        const deviceId = url.searchParams.get('deviceId');
        const clientInstanceId = url.searchParams.get('clientInstanceId');

        if (!token || !deviceId || !clientInstanceId) {
          socket.close(4001, 'Missing token, deviceId, or clientInstanceId');
          return;
        }

        const secret = this.config.getOrThrow<string>(CONFIG_KEYS.jwtAccessSecret);
        const payload = await this.jwt.verifyAsync<{ sub: string }>(token, { secret });
        const userId = payload.sub;

        if (!this.connections.has(userId)) {
          this.connections.set(userId, new Map());
        }
        const userMap = this.connections.get(userId)!;
        if (!userMap.has(deviceId)) userMap.set(deviceId, new Map());
        const deviceMap = userMap.get(deviceId)!;
        deviceMap.set(clientInstanceId, socket);

        socket.on('close', () => {
          const map = this.connections.get(userId);
          if (map) {
            const clients = map.get(deviceId);
            clients?.delete(clientInstanceId);
            if (clients?.size === 0) map.delete(deviceId);
            if (map.size === 0) this.connections.delete(userId);
          }
        });

        socket.on('error', () => {
          socket.close();
        });
      } catch {
        socket.close(4003, 'Unauthorized');
      }
    });
  }

  onModuleDestroy() {
    if (this.upgradeHandler) {
      const httpServer = this.adapterHost.httpAdapter?.getHttpServer();
      httpServer?.off('upgrade', this.upgradeHandler);
    }
    this.wss?.close();
  }

  async notifySyncAvailable(event: SyncInvalidationEvent): Promise<void> {
    const userMap = this.connections.get(event.userId);
    if (!userMap || userMap.size === 0) return;

    const payload = JSON.stringify({
      type: 'SYNC_AVAILABLE',
      cursor: event.cursor,
      originDeviceId: event.originDeviceId,
      originClientInstanceId: event.originClientInstanceId,
    });

    for (const [deviceId, clients] of userMap.entries()) {
      for (const [clientInstanceId, socket] of clients.entries()) {
        const isOrigin = deviceId === event.originDeviceId && clientInstanceId === event.originClientInstanceId;
        if (!isOrigin && socket.readyState === WebSocket.OPEN) {
          socket.send(payload);
        }
      }
    }
  }
}
