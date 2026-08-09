import type { ApiClientContext } from './apiContext';

export function createSyncApi(ctx: ApiClientContext) {
  return {
    async registerSyncDevice(data: { deviceId: string; lastKnownSyncCursor?: string }) {
      return ctx.request<void>('/devices/register', {
        method: 'POST',
        body: JSON.stringify({ ...data, platform: 'WEB' }),
      });
    },
    async updateSyncDevice(deviceId: string, lastKnownSyncCursor: string) {
      return ctx.request<void>(`/devices/${deviceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ lastKnownSyncCursor }),
      });
    },
  };
}

export type SyncApi = ReturnType<typeof createSyncApi>;
