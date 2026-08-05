import type { ApiClientContext } from './apiContext';

export function createSyncApi(ctx: ApiClientContext) {
  return {
    registerSyncDevice(data: { deviceId: string; lastKnownSyncCursor?: string }) {
      return ctx.request('/devices/register', {
        method: 'POST',
        body: JSON.stringify({ ...data, platform: 'WEB' }),
      });
    },
    updateSyncDevice(deviceId: string, lastKnownSyncCursor: string) {
      return ctx.request(`/devices/${deviceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ lastKnownSyncCursor }),
      });
    },
  };
}

export type SyncApi = ReturnType<typeof createSyncApi>;
