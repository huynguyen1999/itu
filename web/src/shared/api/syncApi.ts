import { registerDevice, updateDevice } from '../../generated/api/devices/devices';
import type { ApiClientContext } from './apiContext';

export function createSyncApi(ctx: ApiClientContext) {
  return {
    async registerSyncDevice(data: { deviceId: string; lastKnownSyncCursor?: string }) {
      return (await registerDevice({ ...data, platform: 'WEB' } as any)) as unknown as void;
    },
    async updateSyncDevice(deviceId: string, lastKnownSyncCursor: string) {
      return (await updateDevice(deviceId, { lastKnownSyncCursor } as any)) as unknown as void;
    },
  };
}

export type SyncApi = ReturnType<typeof createSyncApi>;
