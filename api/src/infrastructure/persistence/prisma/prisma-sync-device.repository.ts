import { Injectable } from '@nestjs/common';
import { SyncDevicePlatform } from '@core/domain/enums';
import { SyncDeviceModel } from '@core/domain/models';
import { ISyncDeviceRepository } from '@core/application/ports/out/repositories.port';
import type { UpdateSyncDeviceData, UpsertSyncDeviceData } from '@core/application/ports/out/repository-types.port';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

function mapSyncDevice(device: {
  id: string;
  userId: string;
  platform: string;
  pushToken: string | null;
  lastSeenAt: Date;
  lastKnownSyncCursor: string | null;
  notificationPreference: unknown;
  createdAt: Date;
  updatedAt: Date;
}): SyncDeviceModel {
  return {
    id: device.id,
    userId: device.userId,
    platform: device.platform as SyncDevicePlatform,
    pushToken: device.pushToken,
    lastSeenAt: device.lastSeenAt,
    lastKnownSyncCursor: device.lastKnownSyncCursor,
    notificationPreference: device.notificationPreference,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
  };
}

@Injectable()
export class PrismaSyncDeviceRepository implements ISyncDeviceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(userId: string, data: UpsertSyncDeviceData): Promise<SyncDeviceModel | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return null;

    const device = await this.prisma.syncDevice.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        userId,
        platform: data.platform,
        pushToken: data.pushToken ?? null,
        lastKnownSyncCursor: data.lastKnownSyncCursor ?? null,
        notificationPreference: this.toJson(data.notificationPreference),
        lastSeenAt: new Date(),
      },
      update: {
        userId,
        platform: data.platform,
        pushToken: data.pushToken ?? null,
        lastKnownSyncCursor: data.lastKnownSyncCursor ?? null,
        notificationPreference: this.toJson(data.notificationPreference),
        lastSeenAt: new Date(),
      },
    });
    return mapSyncDevice(device);
  }

  async update(userId: string, deviceId: string, data: UpdateSyncDeviceData): Promise<SyncDeviceModel | null> {
    const existing = await this.prisma.syncDevice.findFirst({ where: { id: deviceId, userId } });
    if (!existing) return null;

    const device = await this.prisma.syncDevice.update({
      where: { id: deviceId },
      data: {
        ...(data.pushToken !== undefined ? { pushToken: data.pushToken } : {}),
        ...(data.lastKnownSyncCursor !== undefined ? { lastKnownSyncCursor: data.lastKnownSyncCursor } : {}),
        ...(data.notificationPreference !== undefined
          ? { notificationPreference: this.toJson(data.notificationPreference) }
          : {}),
        lastSeenAt: new Date(),
      },
    });
    return mapSyncDevice(device);
  }

  async delete(userId: string, deviceId: string): Promise<boolean> {
    const result = await this.prisma.syncDevice.deleteMany({ where: { id: deviceId, userId } });
    return result.count > 0;
  }

  async listNotificationTargets(userId: string, excludeDeviceId: string): Promise<SyncDeviceModel[]> {
    const devices = await this.prisma.syncDevice.findMany({
      where: {
        userId,
        id: { not: excludeDeviceId },
      },
      orderBy: { lastSeenAt: 'desc' },
    });
    return devices.map(mapSyncDevice);
  }

  private toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    return value == null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
  }
}
