import { SyncDevicePlatform, UsageSource } from '@prisma/client';
import type { SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import { InvalidSyncMutationException } from '@core/domain/exceptions';
import { HealthKitSyncService } from '@core/application/use-cases/health.service';
import {
  HEALTH_KIT_SOURCE,
  HealthSummarySyncData,
  HealthWorkoutSyncData,
} from '@core/application/use-cases/health.types';
import { Tx, recordSyncChange } from './prisma-sync-mutation.shared';

export function healthSummaryEntityId(syncDeviceId: string, localDate: string): string {
  return `${syncDeviceId}:${localDate}`;
}

export function healthWorkoutEntityId(syncDeviceId: string, healthKitUUID: string): string {
  return `${syncDeviceId}:${healthKitUUID}`;
}

export class PrismaSyncHealth {
  readonly kinds: readonly string[] = ['healthsummary.upsert', 'healthworkout.upsert', 'healthworkout.delete'];
  private readonly health = new HealthKitSyncService();

  async applyMutation(
    tx: Tx,
    userId: string,
    mutation: SyncMutation,
    _outcome: { growthReceipt?: unknown },
  ): Promise<null | undefined> {
    const deviceId = mutation.serverDeviceId;
    if (!deviceId) throw new InvalidSyncMutationException('HealthKit mutations require a registered sync device');
    let device = await tx.syncDevice.findFirst({
      where: { id: deviceId, userId, platform: SyncDevicePlatform.IOS },
      select: { id: true },
    });
    if (!device) {
      const existing = await tx.syncDevice.findFirst({ where: { id: deviceId }, select: { id: true, userId: true } });
      if (!existing) {
        device = await tx.syncDevice.create({
          data: {
            id: deviceId,
            userId,
            platform: SyncDevicePlatform.IOS,
            lastSeenAt: new Date(),
          },
          select: { id: true },
        });
      } else if (existing.userId === userId) {
        device = await tx.syncDevice.update({
          where: { id: deviceId },
          data: { platform: SyncDevicePlatform.IOS, lastSeenAt: new Date() },
          select: { id: true },
        });
      } else {
        throw new InvalidSyncMutationException('Sync device is registered to another user');
      }
    }

    switch (mutation.kind) {
      case 'healthsummary.upsert': {
        const summary = this.health.parseSummary(mutation.payload);
        const localDate = this.health.localDateKey(summary.localDate);
        const row = await tx.healthSummary.upsert({
          where: {
            userId_source_syncDeviceId_localDate: {
              userId,
              source: UsageSource.HEALTH_KIT,
              syncDeviceId: device.id,
              localDate: summary.localDate,
            },
          },
          create: {
            userId,
            syncDeviceId: device.id,
            ...summary,
          },
          update: {
            steps: summary.steps,
            walkingRunningDistanceMeters: summary.walkingRunningDistanceMeters,
            activeEnergyKcal: summary.activeEnergyKcal,
            exerciseMinutes: summary.exerciseMinutes,
            standHours: summary.standHours,
            sleepMinutes: summary.sleepMinutes,
            sleepStart: summary.sleepStart,
            sleepEnd: summary.sleepEnd,
            restingHeartRateBpm: summary.restingHeartRateBpm,
            hrvMilliseconds: summary.hrvMilliseconds,
            workoutCount: summary.workoutCount,
            workoutMinutes: summary.workoutMinutes,
            workoutEnergyKcal: summary.workoutEnergyKcal,
          },
        });
        await recordSyncChange(
          tx,
          userId,
          'healthsummary',
          healthSummaryEntityId(device.id, localDate),
          'UPSERT',
          this.summaryData(row),
        );
        return null;
      }
      case 'healthworkout.upsert': {
        const workout = this.health.parseWorkout(mutation.payload);
        const row = await tx.healthWorkout.upsert({
          where: {
            userId_source_syncDeviceId_healthKitUUID: {
              userId,
              source: UsageSource.HEALTH_KIT,
              syncDeviceId: device.id,
              healthKitUUID: workout.healthKitUUID,
            },
          },
          create: {
            userId,
            syncDeviceId: device.id,
            ...workout,
          },
          update: {
            activityType: workout.activityType,
            startedAt: workout.startedAt,
            endedAt: workout.endedAt,
            durationSeconds: workout.durationSeconds,
            energyKcal: workout.energyKcal,
            sourceBundleId: workout.sourceBundleId,
            deviceName: workout.deviceName,
          },
        });
        await recordSyncChange(
          tx,
          userId,
          'healthworkout',
          healthWorkoutEntityId(device.id, workout.healthKitUUID),
          'UPSERT',
          this.workoutData(row),
        );
        return null;
      }
      case 'healthworkout.delete': {
        this.health.assertSource(mutation.payload);
        const healthKitUUID = this.health.workoutUUID(mutation.payload, mutation.entityId);
        const existing = await tx.healthWorkout.findFirst({
          where: {
            userId,
            syncDeviceId: device.id,
            source: UsageSource.HEALTH_KIT,
            healthKitUUID,
          },
        });
        if (!existing) return null;
        await tx.healthWorkout.delete({ where: { id: existing.id } });
        await recordSyncChange(
          tx,
          userId,
          'healthworkout',
          healthWorkoutEntityId(device.id, healthKitUUID),
          'DELETE',
          this.workoutData(existing),
        );
        return null;
      }
      default:
        return undefined;
    }
  }

  summaryData(row: {
    syncDeviceId: string;
    source: UsageSource;
    localDate: Date;
    steps: number;
    walkingRunningDistanceMeters: number;
    activeEnergyKcal: number;
    exerciseMinutes: number;
    standHours: number | null;
    sleepMinutes: number | null;
    sleepStart: Date | null;
    sleepEnd: Date | null;
    restingHeartRateBpm: number | null;
    hrvMilliseconds: number | null;
    workoutCount: number;
    workoutMinutes: number;
    workoutEnergyKcal: number;
  }): HealthSummarySyncData {
    return {
      source: HEALTH_KIT_SOURCE,
      syncDeviceId: row.syncDeviceId,
      localDate: this.health.localDateKey(row.localDate),
      steps: row.steps,
      walkingRunningDistanceMeters: row.walkingRunningDistanceMeters,
      activeEnergyKcal: row.activeEnergyKcal,
      exerciseMinutes: row.exerciseMinutes,
      standHours: row.standHours,
      sleepMinutes: row.sleepMinutes,
      sleepStart: row.sleepStart?.toISOString() ?? null,
      sleepEnd: row.sleepEnd?.toISOString() ?? null,
      restingHeartRateBpm: row.restingHeartRateBpm,
      hrvMilliseconds: row.hrvMilliseconds,
      workoutCount: row.workoutCount,
      workoutMinutes: row.workoutMinutes,
      workoutEnergyKcal: row.workoutEnergyKcal,
    };
  }

  workoutData(row: {
    syncDeviceId: string;
    source: UsageSource;
    healthKitUUID: string;
    activityType: string;
    startedAt: Date;
    endedAt: Date;
    durationSeconds: number;
    energyKcal: number | null;
    sourceBundleId: string | null;
    deviceName: string | null;
  }): HealthWorkoutSyncData {
    return {
      source: HEALTH_KIT_SOURCE,
      syncDeviceId: row.syncDeviceId,
      healthKitUUID: row.healthKitUUID,
      activityType: row.activityType,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt.toISOString(),
      durationSeconds: row.durationSeconds,
      energyKcal: row.energyKcal,
      sourceBundleId: row.sourceBundleId,
      deviceName: row.deviceName,
    };
  }
}
