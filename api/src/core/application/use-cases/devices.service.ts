import type {
  IDevicesUseCase,
  RegisterSyncDeviceInput,
  UpdateSyncDeviceInput,
} from '@core/application/ports/in/devices-use-case.port';
import type { ISyncDeviceRepository } from '@core/application/ports/out/repositories.port';
import { EntityNotFoundException, ForbiddenResourceException } from '@core/domain/exceptions';

export class DevicesService implements IDevicesUseCase {
  constructor(private readonly devices: ISyncDeviceRepository) {}

  async register(userId: string, input: RegisterSyncDeviceInput) {
    const device = await this.devices.upsert(userId, {
      id: input.deviceId,
      platform: input.platform,
      pushToken: input.pushToken,
      lastKnownSyncCursor: input.lastKnownSyncCursor,
      notificationPreference: input.notificationPreference,
    });
    if (!device) throw new ForbiddenResourceException();
    return device;
  }

  async update(userId: string, deviceId: string, input: UpdateSyncDeviceInput) {
    const device = await this.devices.update(userId, deviceId, input);
    if (!device) throw new EntityNotFoundException('SyncDevice', deviceId);
    return device;
  }

  async delete(userId: string, deviceId: string) {
    const deleted = await this.devices.delete(userId, deviceId);
    if (!deleted) throw new EntityNotFoundException('SyncDevice', deviceId);
  }
}
