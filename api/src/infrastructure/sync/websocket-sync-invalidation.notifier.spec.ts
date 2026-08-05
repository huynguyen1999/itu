import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WebSocket } from 'ws';
import { WebSocketSyncInvalidationNotifier } from './websocket-sync-invalidation.notifier';

describe('WebSocketSyncInvalidationNotifier', () => {
  it('notifies a sibling tab on the same device while excluding only the originating tab', async () => {
    const notifier = new WebSocketSyncInvalidationNotifier(
      {} as HttpAdapterHost,
      {} as JwtService,
      {} as ConfigService,
    );
    const originSend = jest.fn();
    const siblingSend = jest.fn();
    const otherDeviceSend = jest.fn();
    const socket = (send: jest.Mock) => ({ readyState: WebSocket.OPEN, send }) as unknown as WebSocket;
    const connections = new Map([
      [
        'user-1',
        new Map([
          [
            'device-1',
            new Map([
              ['client-a', socket(originSend)],
              ['client-b', socket(siblingSend)],
            ]),
          ],
          ['device-2', new Map([['client-c', socket(otherDeviceSend)]])],
        ]),
      ],
    ]);
    (notifier as unknown as { connections: typeof connections }).connections = connections;

    await notifier.notifySyncAvailable({
      userId: 'user-1',
      originDeviceId: 'device-1',
      originClientInstanceId: 'client-a',
      cursor: '42',
      targets: [],
    });

    expect(originSend).not.toHaveBeenCalled();
    expect(siblingSend).toHaveBeenCalledTimes(1);
    expect(otherDeviceSend).toHaveBeenCalledTimes(1);
    expect(JSON.parse(siblingSend.mock.calls[0][0] as string)).toEqual({
      type: 'SYNC_AVAILABLE',
      cursor: '42',
      originDeviceId: 'device-1',
      originClientInstanceId: 'client-a',
    });
  });
});
