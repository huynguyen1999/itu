import { DevicesService } from './devices.service';
import { ISyncDeviceRepository } from '@core/application/ports/out/repositories.port';
import { SyncDevicePlatform } from '@core/domain/enums';
import { EntityNotFoundException, ForbiddenResourceException } from '@core/domain/exceptions';

describe('DevicesService', () => {
  const now = new Date('2026-07-16T10:30:00.000Z');

  it('registers a sync-capable device for the authenticated user', async () => {
    const repository: jest.Mocked<ISyncDeviceRepository> = {
      upsert: jest.fn().mockResolvedValue({
        id: 'web-device-1',
        userId: 'user-1',
        platform: SyncDevicePlatform.WEB,
        pushToken: null,
        lastKnownSyncCursor: '12',
        notificationPreference: { syncAvailable: true },
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      update: jest.fn(),
      delete: jest.fn(),
      listNotificationTargets: jest.fn(),
    };
    const service = new DevicesService(repository);

    const device = await service.register('user-1', {
      deviceId: 'web-device-1',
      platform: SyncDevicePlatform.WEB,
      lastKnownSyncCursor: '12',
      notificationPreference: { syncAvailable: true },
    });

    expect(device.id).toBe('web-device-1');
    expect(repository.upsert).toHaveBeenCalledWith('user-1', {
      id: 'web-device-1',
      platform: SyncDevicePlatform.WEB,
      pushToken: undefined,
      lastKnownSyncCursor: '12',
      notificationPreference: { syncAvailable: true },
    });
  });

  it('rejects registration when the device ID belongs to another user', async () => {
    const repository: jest.Mocked<ISyncDeviceRepository> = {
      upsert: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      delete: jest.fn(),
      listNotificationTargets: jest.fn(),
    };
    const service = new DevicesService(repository);

    await expect(
      service.register('user-2', {
        deviceId: 'web-device-1',
        platform: SyncDevicePlatform.WEB,
      }),
    ).rejects.toBeInstanceOf(ForbiddenResourceException);
  });

  it('updates only devices owned by the authenticated user', async () => {
    const repository: jest.Mocked<ISyncDeviceRepository> = {
      upsert: jest.fn(),
      update: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
      listNotificationTargets: jest.fn(),
    };
    const service = new DevicesService(repository);

    await expect(service.update('user-1', 'missing-device', { lastKnownSyncCursor: '20' })).rejects.toBeInstanceOf(
      EntityNotFoundException,
    );
    expect(repository.update).toHaveBeenCalledWith('user-1', 'missing-device', { lastKnownSyncCursor: '20' });
  });

  it('deletes only devices owned by the authenticated user', async () => {
    const repository: jest.Mocked<ISyncDeviceRepository> = {
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(false),
      listNotificationTargets: jest.fn(),
    };
    const service = new DevicesService(repository);

    await expect(service.delete('user-1', 'missing-device')).rejects.toBeInstanceOf(EntityNotFoundException);
    expect(repository.delete).toHaveBeenCalledWith('user-1', 'missing-device');
  });
});
