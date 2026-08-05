import { SyncDevicePlatform } from '@core/domain/enums';
import { SyncDeviceModel } from '@core/domain/models';

export interface RegisterSyncDeviceInput {
  deviceId: string;
  platform: SyncDevicePlatform;
  pushToken?: string | null;
  lastKnownSyncCursor?: string | null;
  notificationPreference?: unknown;
}

export interface UpdateSyncDeviceInput {
  pushToken?: string | null;
  lastKnownSyncCursor?: string | null;
  notificationPreference?: unknown;
}

export interface IDevicesUseCase {
  register(userId: string, input: RegisterSyncDeviceInput): Promise<SyncDeviceModel>;
  update(userId: string, deviceId: string, input: UpdateSyncDeviceInput): Promise<SyncDeviceModel>;
  delete(userId: string, deviceId: string): Promise<void>;
}
